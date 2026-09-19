import type { CapacitorConfig } from "@capacitor/cli";

const SITE_URL = "https://continuitycare-ai.vercel.app";

const config: CapacitorConfig = {
  appId: "uz.medcare.app",
  appName: "MedCare",
  // Placeholder bundle; the real UI is the live site loaded via server.url.
  webDir: "capacitor-web",
  server: {
    url: SITE_URL,
    // https scheme so Supabase's secure auth cookies are stored and sent.
    androidScheme: "https",
    allowNavigation: ["continuitycare-ai.vercel.app", "*.vercel.app", "*.supabase.co"],
    cleartext: false,
  },
  android: {
    backgroundColor: "#0f766e",
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      launchAutoHide: true,
      backgroundColor: "#0f766e",
      androidScaleType: "CENTER_INSIDE",
      showSpinner: false,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#0f766e",
      overlaysWebView: false,
    },
    Keyboard: {
      resize: "body",
      resizeOnFullScreen: true,
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
    LocalNotifications: {
      smallIcon: "ic_stat_notify",
      iconColor: "#0f766e",
    },
  },
};

export default config;
