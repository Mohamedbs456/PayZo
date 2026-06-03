const fs = require("fs");
const path = require("path");

const file = path.join(__dirname, "google-services.json");

if (!fs.existsSync(file)) {
  console.error(
    [
      "",
      "Build stopped: google-services.json is missing.",
      "",
      "Create a Firebase project, add an Android app with package com.payzo.client,",
      "download google-services.json, and place it at Client-Mobile-App/google-services.json.",
      "Push notifications (FCM) and the preview APK build require it.",
      "See BACKEND_DEPENDENCIES.md for the device-registration contract.",
      "",
    ].join("\n"),
  );
  process.exit(1);
}

console.log("google-services.json present.");
