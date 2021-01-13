//https://github.com/actions/toolkit
const core = require('@actions/core')
const GitHub = require('@actions/github')
const io = require('@actions/io')
const { format } = require('util')
const fs = require('fs')
const path = require('path')
//https://github.com/sindresorhus/got
const got = require('got')
//https://github.com/broofa/mime
const { getType } = require('mime')

const tagName = core.getInput('tag_name', { required: true }),
    bodyPath = core.getInput('body_path', { required: false }),
    assetFile = core.getInput('asset_files', { require: false }),
    draft = core.getInput('draft', { required: false }) === 'true',
    prerelease = core.getInput('prerelease', { required: false }) === 'true',
    githubToken = process.env.GITHUB_TOKEN,
    octokit = GitHub.getOctokit(githubToken),
    context = GitHub.context,
    { owner: currentOwner, repo: currentRepo } = context.repo,
    getRepo = core.getInput('repo', { required: false }) || currentOwner + "/" + currentRepo
var releaseName = core.getInput('release_name', { required: false }).replace('refs/tags/', ''),
    body = core.getInput('body', { required: false }),
    tag = tagName.replace('refs/tags/', '')
const
    owner = getRepo.match(/^[\s\w]+(?=\/)/g)[0],
    repo = getRepo.match(/[^\/][\d\w]+$/g)[0]

var assetArray = [],
    bodyFileContent,
    latestAsset,
    uploadUrl

core.info(
    format('tag_name:%s,release_name:%s,body:%s,body_path:%s,asset_files:%s,draft:%s,prerelease:%s,owner:%s,repo:%s',
        tag, releaseName, body, bodyPath, assetFile, draft, prerelease, owner, repo))

Main()

async function Main() {
    try {

        var LatestPromise
        if (tag == 'inherit' && currentRepo != repo) {
            LatestPromise = GetLatest()//update body releaseName
        }

        if (bodyPath !== '' && !!bodyPath) {
            let bodyStr = fs.readFileSync(bodyPath, { encoding: 'utf8' })
            core.info(bodyStr)
            bodyFileContent = (body ? body + '\n' : '') + bodyStr
        }

        await Promise.all([LatestPromise])
        var DownloadPromise = DownloadAssets()//assetArray
        var CreatePromise = CreateRelease()//uploadUrl

        var DecodePromise
        if (assetFile != '' && !!assetFile) {
            DecodePromise = DecodeAssetFile()//assetArray
        }

        await Promise.all([DownloadPromise, CreatePromise, DecodePromise])
            .then(() => UploadAssets())

    } catch (error) {
        core.setFailed(error)
    }
}

//API: https://octokit.github.io/rest.js/v18#repos-get-latest-release
async function GetLatest() {
    core.info('GetLatest Start')
    let latestRelease = null
    latestRelease = await octokit.repos.getLatestRelease({
        owner: currentOwner,
        repo: currentRepo
    }).catch(err => {
        core.setFailed(err)
        throw new Error(err)
    })

    const {
        data: { tag_name: latestTag, name: latestName, body: latestBody }
    } = latestRelease
    latestAsset = latestRelease.data.assets || ''
    core.info(
        format('latest_tag:%s,latest_name:%s,latest_body:%s', latestTag, latestName, latestBody))

    tag = latestTag
    if (body != '') {
        body += latestBody != '' ? "\n" + latestBody : ''
    } else {
        body = latestBody
    }
    if (releaseName != '') {
        releaseName += latestName != '' ? " " + latestName : ''
    }
    core.info('GetLatest Done')
}

async function DownloadAssets() {
    core.info('DownloadAssets Start')
    let assetDirPath = path.join('.', 'asset_files')
    await io.mkdirP(assetDirPath).catch(err => core.setFailed(err))
    for (var i in latestAsset) {
        core.info('Download ' + latestAsset[i].name)

        let filePath = path.join(assetDirPath, latestAsset[i].name)
        const gotOptions = {
            url: latestAsset[i].url,
            headers: {
                Accept: 'application/octet-stream',
                Authorization: 'token ' + githubToken
            }
        }
        let writeStream = fs.createWriteStream(filePath)
        let response = got.stream(gotOptions)
        response.pipe(writeStream)
        await new Promise(fulfill => writeStream.on('finish', fulfill))
        let assetSize = fs.statSync(filePath).size
        core.info(
            format('%s file size:%s', path.basename(filePath), assetSize))
        if (assetSize != latestAsset[i].size) {
            let errorMsg = format('Download Error\n%s size %s => %s', latestAsset[i].name, latestAsset[i].size, assetSize)
            throw new Error(errorMsg)
        }
        assetArray.push(filePath)
    }
    core.info('DownloadAssets Done')
}

//API: https://github.com/actions/toolkit/tree/master/packages/core#inputsoutputs
async function CreateRelease() {
    core.info('CreateRealease Start')
    let createReleaseResponse = await octokit.repos.createRelease({
        owner,
        repo,
        tag_name: tag,
        name: releaseName,
        body: bodyFileContent || body,
        draft,
        prerelease
    }).catch(err => {
        core.setFailed(err)
        throw new Error(err)
    })

    const {
        data: { id: releaseId, html_url: htmlUrl }
    } = createReleaseResponse
    uploadUrl = createReleaseResponse.data.upload_url

    core.setOutput('id', releaseId)
    core.setOutput('html_url', htmlUrl)
    core.setOutput('upload_url', uploadUrl)
    core.info('CreateRelease Done')
}

async function DecodeAssetFile() {
    core.info('DecodeAssetFile Start')
    let dir
    try {
        dir = fs.readdirSync(assetFile)
    } catch (err) {
        core.debug(err)
        switch (err.code) {
            case 'ENOENT':
                core.info(assetFile + ' not exists')
                break
            case 'ENOTDIR':
                core.info(assetFile + ' exists')
                assetArray.push(assetFile)
                break
            default:
                core.error(err)
                break
        }
    }
    if (dir) {
        dir.forEach((val) => {
            let subFile = path.join(assetFile, val)
            if (!fs.statSync(subFile).isDirectory())
                assetArray.push(subFile)
        })
    }
    core.info('DecodeAssetFile Done')
}

//API: https://octokit.github.io/rest.js/v16#repos-upload-release-asset
async function UploadAssets() {
    core.info('UploadAssets Start')
    for (var i in assetArray) {
        core.info('Upload ' + path.basename(assetArray[i]))

        let fileMime = getType(assetArray[i]) || 'application/octet-stream'
        let charset = fileMime.indexOf('text') > -1 ? 'utf-8' : null

        let headers = {
            'content-type': fileMime,
            'content-length': fs.statSync(assetArray[i]).size
        }

        core.debug(
            format('content-type:%s,\ncontent-length:%s,\nupload_url:%s,\nfile_path:%s',
                fileMime, headers['content-length'], uploadUrl, assetArray[i])
        )

        let uploadAssetResponse = await octokit.repos.uploadReleaseAsset({
            url: uploadUrl,
            headers,
            name: path.basename(assetArray[i]),
            data: fs.readFileSync(assetArray[i], charset)
        })

        let {
            data: { browser_download_url: browserDownloadUrl }
        } = uploadAssetResponse;

        core.info(
            format('%s url:%s', path.basename(assetArray[i]), browserDownloadUrl)
        )
    }
    core.info('UploadAssets Done')
}