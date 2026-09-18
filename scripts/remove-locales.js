const fs = require("fs");
const path = require("path");

module.exports = async function (context) {
  const localesDir = path.join(context.appOutDir, "locales");

  if (fs.existsSync(localesDir)) {
    const files = fs.readdirSync(localesDir);

    for (const file of files) {
      // Keep only English locales, delete others
      if (!file.startsWith("en")) {
        fs.unlinkSync(path.join(localesDir, file));
      }
    }

    console.log("Removed unused locales, kept only English.");
  }
};
