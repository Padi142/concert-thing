import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appConfig = JSON.parse(readFileSync("app.json", "utf8")) as {
  expo: { userInterfaceStyle?: string; plugins?: (string | unknown[])[] };
};
const plugins = appConfig.expo.plugins ?? [];
const stringsXml = readFileSync("android/app/src/main/res/values/strings.xml", "utf8");
const mainActivity = readFileSync("android/app/src/main/java/com/padi142/concertthing/MainActivity.kt", "utf8");

assert.equal(appConfig.expo.userInterfaceStyle, "automatic");
assert.ok(plugins.some(plugin => plugin === "expo-system-ui" || (Array.isArray(plugin) && plugin[0] === "expo-system-ui")), "expo-system-ui config plugin must remain enabled");
assert.match(stringsXml, /name="expo_system_ui_user_interface_style"[^>]*>automatic<\/string>/, "native Android resources must override expo-system-ui's light default");
assert.match(mainActivity, /override fun onConfigurationChanged\(newConfig: Configuration\)/, "Android activity must forward appearance changes");
assert.match(mainActivity, /Intent\("onConfigurationChanged"\)/, "appearance changes must be broadcast to React Native");

console.log("automatic theme configuration test passed");
