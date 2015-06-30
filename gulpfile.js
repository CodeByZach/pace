var fs          = require('fs');
var del         = require('del');
var glob        = require('glob');
var path        = require('path');
var mkdirp      = require('mkdirp');
var gulp        = require('gulp');
var babel       = require('gulp-babel');
var bump        = require('gulp-bump');
var header      = require('gulp-header');
var plumber     = require('gulp-plumber');
var rename      = require('gulp-rename');
var uglify      = require('gulp-uglify');
var umd         = require('gulp-wrap-umd');

var ThemeUtils = require('./docs/lib/themes');

// Variables
var distDir = './dist';
var pkg = require('./package.json');
var banner = ['/*!', pkg.name, pkg.version, '*/\n'].join(' ');
var umdOptions = {
  exports: 'Pace',
  namespace: 'Pace'
};
var themeColors = {
  black:  '#000000',
  white:  '#ffffff',
  silver: '#d6d6d6',
  red:    '#ee3148',
  orange: '#eb7a55',
  yellow: '#fcd25a',
  green:  '#22df80',
  blue:   '#2299dd',
  pink:   '#e90f92',
  purple: '#7c60e0'
};


// Clean
gulp.task('clean', function() {
  del.sync([distDir]);
});


// Javascript
gulp.task('js', function() {
  gulp.src('./src/js/**/*.js')
    .pipe(plumber())
    .pipe(babel())
    .pipe(umd(umdOptions))
    .pipe(header(banner))

    // Original
    .pipe(gulp.dest(distDir + '/js'))

    // Minified
    .pipe(uglify())
    .pipe(rename({suffix: '.min'}))
    .pipe(gulp.dest(distDir + '/js'));
});


// Themes
gulp.task('themes', function(done) {
  glob('templates/*.tmpl.css', function(err, files) {
    if (err) throw err;
    for (var colorName in themeColors) {
      if ({}.hasOwnProperty.call(themeColors, colorName)) {
        var color = themeColors[colorName];
        files.forEach(function(file) {
          var body = ThemeUtils.compileTheme(fs.readFileSync(file).toString(), {color: color});

          body = "/* This is a compiled file, you should be editing the file in the templates directory */\n" + body;

          var name = path.basename(file);
          name = name.replace('.tmpl', '');
          var pathname = path.join('./themes_new', colorName, name);
          mkdirp.sync(path.dirname(pathname));
          fs.writeFileSync(pathname, body);
        });
      }
    }
    done();
  });
});


// Version bump
var VERSIONS = ['patch', 'minor', 'major'];
for (var i = 0; i < VERSIONS.length; ++i){
  (function(version) {
    gulp.task('version:' + version, function() {
      gulp.src(['package.json', 'bower.json'])
        .pipe(bump({type: version}))
        .pipe(gulp.dest('.'));
    });
  })(VERSIONS[i]);
}


// Watch
gulp.task('watch', ['js', 'themes'], function() {
  gulp.watch('./src/js/**/*', ['js']);
  gulp.watch('./templates/**/*', ['themes']);
});


// Defaults
gulp.task('build', ['js', 'themes']);
gulp.task('default', ['build']);


