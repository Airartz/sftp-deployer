const { execSync } = require('child_process')
const path = require('path')

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return

  const appName = context.packager.appInfo.productFilename
  const appPath = path.join(context.appOutDir, appName + '.app')
  const macosDir = path.join(appPath, 'Contents', 'MacOS')

  try {
    execSync(`chmod -R +x "${macosDir}"`)
    execSync(`find "${appPath}" -name "*.dylib" -exec chmod +x {} \\;`)
    execSync(`find "${appPath}" -name "*.so" -exec chmod +x {} \\;`)
    console.log(`[afterPack] chmod +x applied to ${appPath}`)
  } catch (e) {
    console.warn('[afterPack] chmod failed:', e.message)
  }
}
