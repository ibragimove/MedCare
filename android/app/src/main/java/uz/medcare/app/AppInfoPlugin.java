package uz.medcare.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.firebase.FirebaseApp;

// Lets the web app ask whether Firebase is configured before it calls
// PushNotifications.register(), which otherwise throws natively (and kills
// the process) when google-services.json is absent.
@CapacitorPlugin(name = "AppInfo")
public class AppInfoPlugin extends Plugin {

    @PluginMethod
    public void getInfo(PluginCall call) {
        boolean pushAvailable;
        try {
            pushAvailable = !FirebaseApp.getApps(getContext()).isEmpty();
        } catch (Exception e) {
            pushAvailable = false;
        }

        JSObject result = new JSObject();
        result.put("pushAvailable", pushAvailable);
        call.resolve(result);
    }
}
