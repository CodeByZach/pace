defaultOptions =
  # How long should it take for the bar to animate to a new
  # point after receiving it
  catchupTime: 500

  # How quickly should the bar be moving before it has any progress
  # info from a new source in %/ms
  initialRate: .03

  # What is the minimum amount of time the bar should be on the
  # screen
  minTime: 500

  # What is the minimum amount of time the bar should sit after the last
  # update before disappearing
  ghostTime: 250

  # Its easy for a bunch of the bar to be eaten in the first few frames
  # before we know how much there is to load.  This limits how much of
  # the bar can be used per frame
  maxProgressPerFrame: 10

  # This tweaks the animation easing
  easeFactor: 1.25

  # Should we restart the browser when pushState or replaceState is called?  (Generally
  # means ajax navigation has occured)
  restartOnPushState: true

  elements:
    # How frequently in ms should we check for the elements being tested for
    # using the element monitor?
    checkInterval: 100
    
    # What elements should we wait for before deciding the page is fully loaded (not required)
    selectors: ['body']

now = ->
  performance?.now?() ? +new Date

requestAnimationFrame = window.requestAnimationFrame or window.mozRequestAnimationFrame or
                        window.webkitRequestAnimationFrame or window.msRequestAnimationFrame

cancelAnimationFrame = window.cancelAnimationFrame or window.mozCancelAnimationFrame

if not requestAnimationFrame?
  requestAnimationFrame = (fn) ->
    setTimeout fn, 50

  cancelAnimationFrame = (id) ->
    clearTimeout id

runAnimation = (fn) ->
  last = now()
  tick = ->
    diff = now() - last
    last = now()

    fn diff, ->
      requestAnimationFrame tick

  tick()

result = (obj, key, args...) ->
  if typeof obj[key] is 'function'
    obj[key](args...)
  else
    obj[key]

extend = (out, sources...) ->
  for source in sources when source
    for own key, val of source
      if out[key]? and typeof out[key] is 'object' and val? and typeof val is 'object'
        extend(out[key], val)
      else
        out[key] = val
  out

getFromDOM = (key='options', json=true) ->
  el = document.querySelector "[data-pace-#{ key }]"

  return unless el

  data = el.getAttribute "data-pace-#{ key }"
  
  return data if not json

  try
    return JSON.parse data
  catch e
    console?.error "Error parsing inline pace options", e

window.Pace ?= {}

options = Pace.options = extend defaultOptions, window.paceOptions, getFromDOM()

class Bar
  constructor: ->
    @progress = 0

  getElement: ->
    if not @el?
      @el = document.createElement 'div'
      @el.className = "pace pace-active"

      @el.innerHTML = '''
      <div class="pace-progress">
        <div class="pace-progress-inner"></div>
      </div>
      <div class="pace-activity"></div>
      '''

      if document.body.firstChild?
        document.body.insertBefore @el, document.body.firstChild
      else
        document.body.appendChild @el

    @el

  finish: ->
    el = @getElement()

    el.className = el.className.replace 'pace-active', ''
    el.className += ' pace-inactive'

  update: (prog) ->
    @progress = prog

    do @render

  destroy: ->
    @getElement().parentNode.removeChild(@getElement())

    @el = undefined

  render: ->
    if not document.body?
      return false

    el = @getElement()
      
    el.children[0].style.width = "#{ @progress }%"

    if not @lastRenderedProgress or @lastRenderedProgress|0 != @progress|0
      # The whole-part of the number has changed
      
      el.setAttribute 'data-progress-text', "#{ @progress|0 }%"

      if @progress >= 100
        # We cap it at 99 so we can use prefix-based attribute selectors
        progressStr = '99'
      else
        progressStr = if @progress < 10 then "0" else ""
        progressStr += @progress|0

      el.setAttribute 'data-progress', "#{ progressStr }"

    @lastRenderedProgress = @progress

  done: ->
    @progress >= 100

# Every 100ms, we decide what the next progress should be
# Every time a new thing happens, we decide what the progress should be
# CSS animations can't give us backoff

class Events
  constructor: ->
    @bindings = {}

  trigger: (name, val) ->
    if @bindings[name]?
      for binding in @bindings[name]
        binding.call @, val

  on: (name, fn) ->
    @bindings[name] ?= []
    @bindings[name].push fn

# We should only ever instantiate one of these
_XMLHttpRequest = window.XMLHttpRequest
_XDomainRequest = window.XDomainRequest
class RequestIntercept extends Events
  constructor: ->
    super

    monitor = (req) =>
      _open = req.open
      req.open = (type, url, async) =>
        @trigger 'request', {type, url, request: req}

        _open.apply req, arguments

    window.XMLHttpRequest = ->
      req = new _XMLHttpRequest

      monitor req

      req

    if _XDomainRequest?
      window.XDomainRequest = ->
        req = new _XDomainRequest

        monitor req

        req

intercept = new RequestIntercept

class AjaxMonitor
  constructor: ->
    @elements = []

    intercept.on 'request', ({request}) =>
      @watch request

  watch: (request) ->
    tracker = new RequestTracker(request)

    @elements.push tracker

class RequestTracker
  constructor: (request) ->
    @progress = 0

    if request.onprogress isnt undefined
      # It will be null, not undefined, on browsers which don't support it
      
      size = null
      _onprogress = request.onprogress
      request.onprogress = =>
        try
          headers = request.getAllResponseHeaders()

          for name, val of headers
            if name.toLowerCase() is 'content-length'
              size = +val
              break

        catch e

        if size?
          # This is not perfect as size is in bytes, length is in chars
          try
            @progress = request.responseText.length / size
          catch e
        else
          # If it's chunked encoding, we have no way of knowing the total length of the
          # response, all we can do is increment the progress with backoff such that we
          # never hit 100% until it's done.
          @progress = @progress + (100 - @progress) / 2

      _onprogress?(arguments...)

      for handler in ['onload', 'onabort', 'ontimeout', 'onerror']
        do =>
          fn = request[handler]
          request[handler] = =>
            @progress = 100

            fn?(arguments...)

    else
      _onreadystatechange = request.onreadystatechange
      request.onreadystatechange = =>
        if request.readyState in [0, 4]
          @progress = 100
        else if request.readyState is 3
          @progress = 50

        _onreadystatechange?(arguments...)

class ElementMonitor
  constructor: (options={}) ->
    @elements = []

    options.selectors ?= []
    for selector in options.selectors
      @elements.push new ElementTracker selector
    
class ElementTracker
  constructor: (@selector) ->
    @progress = 0

    @check()

  check: ->
    if document.querySelector(@selector)
      @done()
    else
      setTimeout (=> @check()),
        options.elements.checkInterval

  done: ->
    @progress = 100

class DocumentMonitor
  states:
    loading: 0
    interactive: 50
    complete: 100

  constructor: ->
    @progress = 0

    _onreadystatechange = document.onreadystatechange
    document.onreadystatechange = =>
      if @states[document.readyState]?
        @progress = @states[document.readyState]

      _onreadystatechange?(arguments...)

class EventLagMonitor
  constructor: ->
    @progress = 0

    avg = 0

    points = 0
    last = now()
    setInterval =>
      diff = now() - last - 50
      last = now()

      avg = avg + (diff - avg)/15

      if points++ > 20 and Math.abs(avg) < 3
        avg = 0

      @progress = 100 * (3 / (avg + 3))
    , 50

class Scaler
  constructor: (@source) ->
    @last = @sinceLastUpdate = 0
    @rate = options.initialRate
    @catchup = 0
    @progress = @lastProgress = 0

    if @source?
      @progress = result(@source, 'progress')

  tick: (frameTime, val) ->
    val ?= result(@source, 'progress')

    if val >= 100
      @done = true

    if val == @last
      @sinceLastUpdate += frameTime
    else
      if @sinceLastUpdate
        @rate = (val - @last) / @sinceLastUpdate

      @catchup = (val - @progress) / options.catchupTime

      @sinceLastUpdate = 0
      @last = val

    if val > @progress
      # After we've got a datapoint, we have catchupTime to
      # get the progress bar to reflect that new data
      @progress += @catchup * frameTime

    scaling = (1 - Math.pow(@progress / 100, options.easeFactor))

    # Based on the rate of the last update, we preemptively update
    # the progress bar, scaling it so it can never hit 100% until we
    # know it's done.
    @progress += scaling * @rate * frameTime

    @progress = Math.min(@lastProgress + options.maxProgressPerFrame, @progress)

    @progress = Math.max(0, @progress)
    @progress = Math.min(100, @progress)

    @lastProgress = @progress

    @progress

sources = null
scalers = null
bar = null
uniScaler = null
animation = null
cancelAnimation = null

handlePushState = ->
  if options.restartOnPushState
    Pace.restart()

# We reset the bar whenever it looks like an ajax navigation has occured.
if window.history.pushState?
  _pushState = window.history.pushState
  window.history.pushState = ->
    handlePushState()

    _pushState.apply window.history, arguments

if window.history.replaceState?
  _replaceState = window.history.replaceState
  window.history.replaceState = ->
    handlePushState()

    _replaceState.apply window.history, arguments

SOURCE_KEYS =
  ajax: AjaxMonitor
  elements: ElementMonitor
  document: DocumentMonitor
  eventLag: EventLagMonitor

do init = ->
  sources = []

  for type in ['ajax', 'elements', 'document', 'eventLag']
    if options[type] isnt false
      sources.push new SOURCE_KEYS[type](options[type])

  for source in options.extraSources ? []
    sources.push new source(options)

  bar = new Bar

  # Each source of progress data has it's own scaler to smooth its output
  scalers = []

  # We have an extra scaler for the final output to keep things looking nice as we add and
  # remove sources
  uniScaler = new Scaler

Pace.stop = ->
  bar.destroy()

  # Not all browsers support cancelAnimationFrame
  cancelAnimation = true

  if animation?
    cancelAnimationFrame? animation
    animation = null

  init()

Pace.restart = ->
  Pace.stop()
  Pace.go()

Pace.go = ->
  bar.render()

  cancelAnimation = false
  animation = runAnimation (frameTime, enqueueNextFrame) ->
    # Every source gives us a progress number from 0 - 100
    # It's up to us to figure out how to turn that into a smoothly moving bar
    #
    # Their progress numbers can only increment.  We try to interpolate
    # between the numbers.

    remaining = 100 - bar.progress

    count = sum = 0
    done = true
    # A source is composed of a bunch of elements, each with a raw, unscaled progress
    for source, i in sources
      scalerList = scalers[i] ?= []

      elements = source.elements ? [source]

      # Each element is given it's own scaler, which turns its value into something
      # smoothed for display
      for element, j in elements
        scaler = scalerList[j] ?= new Scaler element

        done &= scaler.done

        continue if scaler.done

        count++
        sum += scaler.tick(frameTime)

    avg = sum / count

    bar.update uniScaler.tick(frameTime, avg)

    start = now()
    if bar.done() or done or cancelAnimation
      bar.update 100

      setTimeout ->
        bar.finish()
      , Math.max(options.ghostTime, Math.min(options.minTime, now() - start))
    else
      enqueueNextFrame()

Pace.start = (_options) ->
  extend options, _options

  bar.render()

  # It's usually possible to render a bit before the document declares itself ready
  if not document.querySelector('.pace')
    setTimeout Pace.start, 50
  else
    Pace.go()

if typeof define is 'function' and define.amd
  # AMD
  define -> Pace
else if typeof exports is 'object'
  # CommonJS
  module.exports = Pace
else
  # Global
  Pace.start()
