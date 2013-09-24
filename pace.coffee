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
  
  # Should pace automatically start when the page is loaded, or should it wait for `start` to
  # be called?  Always false if pace is loaded with AMD or CommonJS.
  startOnPageLoad: true

  # Should we restart the browser when pushState or replaceState is called?  (Generally
  # means ajax navigation has occured)
  restartOnPushState: true
 
  # Should pace automatically restart when a Backbone route change occurs?  Can also be an
  # array of route names.  Ignored if Backbone.js is not included on the page.
  restartOnBackboneRoute: true

  # What element should the pace element be appended to on the page?
  target: 'body'

  elements:
    # How frequently in ms should we check for the elements being tested for
    # using the element monitor?
    checkInterval: 100
    
    # What elements should we wait for before deciding the page is fully loaded (not required)
    selectors: ['body']
    
  eventLag:
    # When we first start measuring event lag, not much is going on in the browser yet, so it's
    # not uncommon for the numbers to be abnormally low for the first few samples.  This configures
    # how many samples we need before we consider a low number to mean completion.
    minSamples: 10

  ajax:
    # Which HTTP methods should we track?
    trackMethods: ['GET']

    # Should we track web socket connections?
    trackWebSockets: true

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
      targetElement = document.querySelector options.target
      if targetElement.firstChild?
        targetElement.insertBefore @el, targetElement.firstChild
      else
        targetElement.appendChild @el

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
    if not document.querySelector(options.target)?
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

_XMLHttpRequest = window.XMLHttpRequest
_XDomainRequest = window.XDomainRequest
_WebSocket = window.WebSocket

extendNative = (to, from) ->
  for key of from::
    try
      val = from::[key]

      if not to[key]? and typeof val isnt 'function'
        to[key] = val
    catch e

# We should only ever instantiate one of these
class RequestIntercept extends Events
  constructor: ->
    super

    monitorXHR = (req) =>
      _open = req.open
      req.open = (type, url, async) =>
        if (type ? 'GET').toUpperCase() in options.ajax.trackMethods
          @trigger 'request', {type, url, request: req}

        _open.apply req, arguments

    window.XMLHttpRequest = (flags) ->
      req = new _XMLHttpRequest(flags)

      monitorXHR req

      req

    extendNative window.XMLHttpRequest, _XMLHttpRequest

    if _XDomainRequest?
      window.XDomainRequest = ->
        req = new _XDomainRequest

        monitorXHR req

        req

      extendNative window.XDomainRequest, _XDomainRequest

    if _WebSocket? and options.ajax.trackWebSockets
      window.WebSocket = (url, protocols) =>
        req = new _WebSocket(url, protocols)

        @trigger 'request', {type: 'socket', url, protocols, request: req}

        req

      extendNative window.WebSocket, _WebSocket

intercept = new RequestIntercept

class AjaxMonitor
  constructor: ->
    @elements = []

    intercept.on 'request', => @watch arguments...

  watch: ({type, request}) ->
    if type is 'socket'
      tracker = new SocketRequestTracker(request)
    else
      tracker = new XHRRequestTracker(request)

    @elements.push tracker

class XHRRequestTracker
  constructor: (request) ->
    @progress = 0

    if window.ProgressEvent?
      # We're dealing with a modern browser with progress event support

      size = null
      request.addEventListener 'progress', (evt) =>
        if evt.lengthComputable
          @progress = 100 * evt.loaded / evt.total
        else
          # If it's chunked encoding, we have no way of knowing the total length of the
          # response, all we can do is increment the progress with backoff such that we
          # never hit 100% until it's done.
          @progress = @progress + (100 - @progress) / 2

      for event in ['load', 'abort', 'timeout', 'error']
        request.addEventListener event, =>
          @progress = 100

    else
      _onreadystatechange = request.onreadystatechange
      request.onreadystatechange = =>
        if request.readyState in [0, 4]
          @progress = 100
        else if request.readyState is 3
          @progress = 50

        _onreadystatechange?(arguments...)

class SocketRequestTracker
  constructor: (request) ->
    @progress = 0

    for event in ['error', 'open']
      request.addEventListener event, =>
        @progress = 100

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
    @progress = @states[document.readyState] ? 100

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

      if points++ > options.eventLag.minSamples and Math.abs(avg) < 3
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

firstLoad = true
if options.restartOnBackboneRoute
  # Bind in a timeout, as it's possible Backbone hasen't been
  # included yet
  setTimeout ->
    return unless window.Backbone?
   
    Backbone.history.on 'route', (router, name) ->
      return unless rule = options.restartOnBackboneRoute

      if firstLoad
        # We don't want to do anything on the initial route
        firstLoad = false
        return

      if typeof rule is 'object'
        # It's an array of route names
        for routeName in rule when routeName is name
          Pace.restart()
          break
      else
        Pace.restart()
  , 0

SOURCE_KEYS =
  ajax: AjaxMonitor
  elements: ElementMonitor
  document: DocumentMonitor
  eventLag: EventLagMonitor

do init = ->
  Pace.sources = sources = []

  for type in ['ajax', 'elements', 'document', 'eventLag']
    if options[type] isnt false
      sources.push new SOURCE_KEYS[type](options[type])

  for source in options.extraSources ? []
    sources.push new source(options)

  Pace.bar = bar = new Bar

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
  if options.startOnPageLoad
    Pace.start()
