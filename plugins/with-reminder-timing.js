const { withMainApplication, withDangerousMod, AndroidConfig } = require('@expo/config-plugins');
const fs = require('fs/promises');
const path = require('path');
module.exports = function withReminderTiming(config) {
  config = AndroidConfig.Permissions.withPermissions(config, [
    'android.permission.SCHEDULE_EXACT_ALARM',
  ]);
  config = withMainApplication(config, (c) => {
    if (!c.modResults.contents.includes('add(ReminderTimingPackage())')) {
      c.modResults.contents = c.modResults.contents.replace(
        'PackageList(this).packages.apply {',
        'PackageList(this).packages.apply {\n          add(ReminderTimingPackage())',
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
        path.join(dir, 'ReminderTimingPackage.kt'),
        `package ${pkg}
import android.app.AlarmManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.*
import com.facebook.react.uimanager.ViewManager
class ReminderTimingModule(private val ctx: ReactApplicationContext) : ReactContextBaseJavaModule(ctx) {
  override fun getName() = "ReminderTiming"
  @ReactMethod fun canSchedule(promise: Promise) {
    promise.resolve(Build.VERSION.SDK_INT < 31 || (ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager).canScheduleExactAlarms())
  }
  @ReactMethod fun openSettings(promise: Promise) {
    try {
      if (Build.VERSION.SDK_INT >= 31) ctx.startActivity(Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:" + ctx.packageName)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      promise.resolve(null)
    } catch (e: Exception) { promise.reject("SETTINGS_UNAVAILABLE", "Unable to open reminder settings", e) }
  }
}
class ReminderTimingPackage : ReactPackage {
  override fun createNativeModules(ctx: ReactApplicationContext): List<NativeModule> = listOf(ReminderTimingModule(ctx))
  override fun createViewManagers(ctx: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}
`,
      );
      return c;
    },
  ]);
};
