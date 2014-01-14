$(function(){
    var codeSelector, switcherHTML, $docContent, options;

    codeSelector = 'pre code[data-type="coffeescript"], pre code[data-type="javascript"]';

    switcherHTML = '' +
        '<ul class="executr-switch-outer">' +
            '<li class="executr-switch" data-code-type="javascript">JS</li>' +
            '<li class="executr-switch selected" data-code-type="coffeescript">Coffee</li>' +
        '</ul>';

    $('pre code').each(function(){
        var $code = $(this),
            lang = $code.get(0).className.substr('lang-'.length)
        ;
        $code.attr('data-type', lang);
    });

    if ($(codeSelector).length) {
        $docContent = $(codeSelector).first().parents('.hs-doc-content').first().append(switcherHTML);
    }

    options = {
        codeSelector: codeSelector,
        codeMirrorOptions: {
            viewportMargin: Infinity
        }
    };

    if (window.EXECUTR_OPTIONS)
        $.extend(true, options, EXECUTR_OPTIONS);

    $('body').executr(options);
});
