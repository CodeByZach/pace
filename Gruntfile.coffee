Path = require('path')
fs = require('fs')

ThemeUtils = require('./docs/lib/themes.coffee')

themeColors =
  black:  '#000000'
  white:  '#ffffff'
  silver: '#d6d6d6'
  red:    '#ee3148'
  orange: '#eb7a55'
  yellow: '#fcd25a'
  green:  '#22df80'
  blue:   '#2299dd'
  pink:   '#e90f92'
  purple: '#7c60e0'

module.exports = (grunt) ->
  grunt.registerTask 'themes', 'Compile the pace theme files', ->
    done = @async()

    options = grunt.config('themes')

    grunt.file.glob options.src, (err, files) ->
      for colorName, color of themeColors
        for file in files
          body = ThemeUtils.compileTheme fs.readFileSync(file).toString(), {color}

          body = "/* This is a compiled file, you should be editing the file in the templates directory */\n" + body

          name = Path.basename file
          name = name.replace '.tmpl', ''
          path = Path.join options.dest, colorName, name

          fs.writeFileSync path, body

      done()

  grunt.initConfig
    pkg: grunt.file.readJSON("package.json")
    coffee:
      compile:
        files:
          'pace.js': 'pace.coffee'
          'docs/lib/themes.js': 'docs/lib/themes.coffee'

    watch:
      coffee:
        files: ['pace.coffee', 'docs/lib/themes.coffee', 'templates/*']
        tasks: ["coffee", "uglify", "themes"]

    uglify:
      options:
        banner: "/*! <%= pkg.name %> <%= pkg.version %> */\n"

      dist:
        src: 'pace.js'
        dest: 'pace.min.js'

    themes:
      src: 'templates/*.tmpl.css'
      dest: 'themes'

  grunt.loadNpmTasks 'grunt-contrib-watch'
  grunt.loadNpmTasks 'grunt-contrib-uglify'
  grunt.loadNpmTasks 'grunt-contrib-coffee'

  grunt.registerTask 'default', ['coffee', 'uglify', 'themes']
