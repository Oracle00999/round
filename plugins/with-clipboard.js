const { withMainApplication, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs/promises');
const path = require('path');
module.exports = function withClipboard(config) {
  config = withMainApplication(config, (c) => {
    if (!c.modResults.contents.includes('add(RoundClipboardPackage())')) {
      c.modResults.contents = c.modResults.contents.replace(
        'PackageList(this).packages.apply {',
        'PackageList(this).packages.apply {\n          add(RoundClipboardPackage())',
      );
    }
    return c;
  });
  return withDangerousMod(config, [
    'android',
    async (c) => {
      const pkg = c.android.package;
      const dir = path.join(
        c.modRequest.platformProjectRoot,
        'app/src/main/java',
        ...pkg.split('.'),
      );
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(
        path.join(dir, 'RoundClipboardPackage.kt'),
        `package ${pkg}
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.*
import com.facebook.react.uimanager.ViewManager
class RoundClipboardModule(private val ctx: ReactApplicationContext) : ReactContextBaseJavaModule(ctx) {
  override fun getName() = "RoundClipboard"
  @ReactMethod fun setString(value: String, promise: Promise) {
    try {
      val clipboard = ctx.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
      clipboard.setPrimaryClip(ClipData.newPlainText("ROUND invitation", value))
      promise.resolve(null)
    } catch (e: Exception) { promise.reject("COPY_FAILED", "Unable to copy invitation", e) }
  }
}
class RoundClipboardPackage : ReactPackage {
  override fun createNativeModules(ctx: ReactApplicationContext): List<NativeModule> = listOf(RoundClipboardModule(ctx))
  override fun createViewManagers(ctx: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}
`,
      );
      return c;
    },
  ]);
};
