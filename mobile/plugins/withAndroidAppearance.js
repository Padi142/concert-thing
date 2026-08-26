const { withMainActivity } = require("expo/config-plugins");

const configurationHandler = `
  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    val intent = Intent("onConfigurationChanged")
    intent.putExtra("newConfig", newConfig)
    sendBroadcast(intent)
  }
`;

module.exports = function withAndroidAppearance(config) {
  return withMainActivity(config, ({ modResults, ...rest }) => {
    if (modResults.language !== "kt") {
      return { ...rest, modResults };
    }

    let contents = modResults.contents;

    if (!contents.includes("import android.content.Intent")) {
      contents = contents.replace(
        "import android.os.Build",
        "import android.content.Intent\nimport android.content.res.Configuration\nimport android.os.Build",
      );
    }

    if (!contents.includes("override fun onConfigurationChanged(newConfig: Configuration)")) {
      const classEnd = contents.lastIndexOf("\n}");
      if (classEnd === -1) {
        throw new Error("Could not find the end of MainActivity.kt");
      }
      contents = `${contents.slice(0, classEnd)}${configurationHandler}${contents.slice(classEnd)}`;
    }

    return { ...rest, modResults: { ...modResults, contents } };
  });
};
