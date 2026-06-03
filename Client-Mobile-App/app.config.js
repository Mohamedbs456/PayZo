const fs = require("fs");
const path = require("path");

// Wire FCM only when google-services.json is present. This keeps dev builds and
// `expo prebuild` working without Firebase (the file is gitignored and supplied
// per-machine); push auto-enables the moment the file is dropped in. See
// prebuild-check.js + BACKEND_DEPENDENCIES.md.
module.exports = ({ config }) => {
  const hasGoogleServices = fs.existsSync(path.join(__dirname, "google-services.json"));
  if (hasGoogleServices) {
    config.android = { ...config.android, googleServicesFile: "./google-services.json" };
  }
  return config;
};
