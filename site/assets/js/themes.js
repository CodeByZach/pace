/*!
 * themes
 */
(function() {
  window.loadTheme = function(name, cb) {
    return $.ajax({
      url: "/pace/assets/css/templates/pace-theme-" + name + ".tmpl.css",
      success: cb
    });
  };

  // Template expressions are written between backticks and evaluated with
  // `args` and `Color`, as in scripts/build.mjs.
  window.compileTheme = function(body, args) {
    if (args == null) {
      args = {};
    }
    var Color = window.Color;
    return body.replace(/`([\s\S]*?)`/gm, function(match, code) {
      return eval(code);
    });
  };
}).call(this);
