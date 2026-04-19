import { registerServerHandlers } from './server.handlers'
import { registerSyncHandlers } from './sync.handlers'
import { registerLogHandlers } from './log.handlers'
import { registerFsHandlers } from './fs.handlers'
import { registerSettingsHandlers } from './settings.handlers'
import { registerBackupHandlers } from './backup.handlers'
import { registerTerminalHandlers } from './terminal.handlers'
import { registerContextMenuHandlers } from './contextmenu.handlers'
import { registerSftpBrowserHandlers } from './sftp-browser.handlers'
import { registerFilesHandlers } from './files.handlers'
import { registerServerInfoHandlers } from './server-info.handlers'
import { registerCloudHandlers } from './cloud.handlers'
import { registerUpdaterHandlers } from './updater.handlers'

export function registerAllHandlers(): void {
  registerServerHandlers()
  registerSyncHandlers()
  registerLogHandlers()
  registerFsHandlers()
  registerSettingsHandlers()
  registerBackupHandlers()
  registerTerminalHandlers()
  registerContextMenuHandlers()
  registerSftpBrowserHandlers()
  registerFilesHandlers()
  registerServerInfoHandlers()
  registerCloudHandlers()
  registerUpdaterHandlers()
}
