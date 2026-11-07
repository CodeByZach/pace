// Builds every generated file from its source:
//   package.json version    -> the headers of pace.js and pace-theme-default.css
//   pace.js                 -> pace.min.js
//   pace-theme-default.css  -> pace-theme-default.min.css
//   templates/*.tmpl.css    -> themes/<color>/*.css
//
// This replaces the original Grunt build (Gruntfile.coffee, removed in 2019 in
// commit 5272503). The theme step reproduces its `themes` task (commit 5f22bd4,
// 2014): same palette, same header, and the same template compiler
// (compileTheme in docs/lib/themes.coffee, commit fbcb989, 2013). Its output
// matches the committed themes byte-for-byte.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { transformSync } from 'esbuild';
import { Color } from './color.mjs';

const root = path.resolve(import.meta.dirname, '..');

// The oldest browser versions in .browserslistrc ("baseline 2021 with
// downstream"). esbuild doesn't read Browserslist, so they're listed here:
// https://esbuild.github.io/api/#target. `npm test` checks the minified build
// against .browserslistrc, so the two can't drift apart unnoticed.
const TARGET = ['chrome96', 'edge96', 'firefox95', 'safari15.2', 'ios15.2'];

// The 10 theme colors, from the original Gruntfile.coffee `themeColors`.
const PALETTE = {
  black: '#000000',
  white: '#ffffff',
  silver: '#d6d6d6',
  red: '#ee3148',
  orange: '#eb7a55',
  yellow: '#fcd25a',
  green: '#22df80',
  blue: '#2299dd',
  pink: '#e90f92',
  purple: '#7c60e0',
};

const THEME_HEADER = '/* This is a compiled file, you should be editing the file in the templates directory */\n';

const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const write = (file, content) => {
  fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  fs.writeFileSync(path.join(root, file), content);
};

const minify = (source, loader) => transformSync(source, { loader, minify: true, target: TARGET }).code;

// Template expressions are written between backticks and evaluated with
// `args.color` and `Color`, as in the original compileTheme.
const compileTheme = (template, color) =>
  template.replace(/`([\s\S]*?)`/g, (match, code) => vm.runInNewContext(code, { args: { color }, Color }));

const withFinalNewline = (text) => text.trimEnd() + '\n';

// package.json is the only place the version is set. This copies it into the
// " * pace.js v…" header line of a source file and returns the updated source.
const { version } = JSON.parse(read('package.json'));
const VERSION_LINE = /^( \* pace\.js v)\S+/m;

const stampVersion = (file) => {
  const source = read(file);
  if (!VERSION_LINE.test(source)) throw new Error(`${file}: no " * pace.js v…" header line`);
  const stamped = source.replace(VERSION_LINE, `$1${version}`);
  if (stamped !== source) write(file, stamped);
  return stamped;
};

write('pace.min.js', minify(stampVersion('pace.js'), 'js'));
write('pace-theme-default.min.css', minify(stampVersion('pace-theme-default.css'), 'css'));

for (const template of fs.readdirSync(path.join(root, 'templates')).filter((f) => f.endsWith('.tmpl.css'))) {
  const source = read(path.join('templates', template));
  for (const [name, color] of Object.entries(PALETTE)) {
    write(path.join('themes', name, template.replace('.tmpl.css', '.css')), withFinalNewline(THEME_HEADER + compileTheme(source, color)));
  }
}
