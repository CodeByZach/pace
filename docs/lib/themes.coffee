loadTheme = (name, cb) ->
  $.ajax
    url: "/pace/templates/pace-theme-#{ name }.tmpl.css"
    success: cb

compileTheme = (body, vars={}) ->
  body.replace /\{\{\s*([^\} \|]+)(?:\|"([^"]+)")?\s*\}\}/g, (match, varName, def) ->
    val = vars[varName] or def

    if not val?
      throw "Theme Template Error: #{ varName } not provided"

    val

if module?
  module.exports = {compileTheme}
else
  window.loadTheme = loadTheme
  window.compileTheme = compileTheme
