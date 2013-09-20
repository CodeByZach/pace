(function() {
  var compileTheme, loadTheme;

  loadTheme = function(name, cb) {
    return $.ajax({
      url: "/pace/templates/pace-theme-" + name + ".tmpl.css",
      success: cb
    });
  };

  compileTheme = function(body, vars) {
    if (vars == null) {
      vars = {};
    }
    return body.replace(/\{\{\s*([^\} \|]+)(?:\|"([^"]+)")?\s*\}\}/g, function(match, varName, def) {
      var val;
      val = vars[varName] || def;
      if (val == null) {
        throw "Theme Template Error: " + varName + " not provided";
      }
      return val;
    });
  };

  if (typeof module !== "undefined" && module !== null) {
    module.exports = {
      compileTheme: compileTheme
    };
  } else {
    window.loadTheme = loadTheme;
    window.compileTheme = compileTheme;
  }

}).call(this);
