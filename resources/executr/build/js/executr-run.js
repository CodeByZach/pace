$(function(){
    $('pre code').each(function(){
        var $code = $(this),
            lang = $code.get(0).className.substr('lang-'.length)
        ;
        $code.attr('data-type', lang);
    });
    $('body').executr({
        codeSelector: 'pre code[data-type="coffeescript"], pre code[data-type="javascript"]',
        codeMirrorOptions: {
            viewportMargin: Infinity
        }
    });
});