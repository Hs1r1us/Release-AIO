# Release-AIO
Create a release, upload release assets, and duplicate a release to other repository.

Reference from [`@actions/create-release`](https://github.com/marketplace/actions/create-a-release) [`@actions/upload-release-asset`](https://github.com/marketplace/actions/upload-a-release-asset)

------------

## Usage

### Environments

- `GITHUB_TOKEN`: Set `secrets.GITHUB_TOKEN` to `env.GITHUB_TOKEN`, ***Pay attention set a new secret token when create a release to other repository***

### Inputs

  - `tag_name`: The name of the tag for this release

#### Optional:

|  Parameter   |                                         Description                                          |      Default       |
| :----------: | :------------------------------------------------------------------------------------------: | :----------------: |
| release_name |                                   The name of the release                                    |        null        |
|     body     |                           Text describing the contents of the tag                            |        null        |
|  body_path   |                         Path to file with information about the tag                          |        null        |
| asset_files  |                           The path to the asset you want to upload                           |        null        |
|    draft     |                             Create a draft (unpublished) release                             |      `false`       |
|  prerelease  |                             Identify the release as a prerelease                             |      `false`       |
|     repo     | Repository on which to release.  Used only if you want to create the release on another repo | CurrOwner/CurrRepo |

### Outputs

- `id`: The release ID
- `html_url`: The URL users can navigate to in order to view the release
- `upload_url`: The URL for uploading assets to the release

### Example

- Create release and upload assets
  
  - `asset_files`: Support file or directory, ***Upload files with depth 1 in the directory when using the directory***
```
- name: Create Release With Asset
  id: Release-AIO
  uses: Hs1r1us/Release-AIO@v1
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  with:
    tag_name: ${{ github.ref }}
    asset_files: './asset_file'
```
- Duplicate the latest Release of the current Repository to the target Repository
  - private_Repo => public_Repo
  - Use in private_Repo
  - [A new token](https://github.com/settings/tokens/new?scopes=repo) to access the target Repository
```
- name: Duplicate Release With Asset to public_Repo
  id: Release-AIO
  uses: Hs1r1us/Release-AIO@v1
  env:
    GITHUB_TOKEN: ${{ secrets.PRIVATE_TOKEN }} # You need a new token to access the target Repository
  with:
    tag_name: 'inherit' # Must use 'inherit' to get the latest release
    body: 'hello world' # Will be added in the new release
    repo: 'Hs1r1us/public_Repo' # The format is like owner/repo
    asset_files: './asset_file' # Will be added in the new release
```
## TODO

- [x] Create a release
- [x] Upload release assets
- [x] Duplicate a release
- [ ] Support archive assets