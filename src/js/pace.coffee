Pace = window.Pace or {}
window.Pace = Pace

extend Pace, Evented::

options = Pace.options = extend {}, defaultOptions, window.paceOptions, getFromDOM()

for source in ['ajax', 'document', 'eventLag', 'elements']
  # true enables them without configuration, so we grab the config from the defaults
  if options[source] is true
    options[source] = defaultOptions[source]

ignoreStack = []

Pace.ignore = (fn, args...) ->
  ignoreStack.unshift 'ignore'
  ret = fn(args...)
  ignoreStack.shift()
  ret

Pace.track = (fn, args...) ->
  ignoreStack.unshift 'track'
  ret = fn(args...)
  ignoreStack.shift()
  ret

shouldTrack = (method='GET') ->
  if ignoreStack[0] is 'track'
    return 'force'

  if not ignoreStack.length and options.ajax
    if method is 'socket' and options.ajax.trackWebSockets
      return true
    else if method.toUpperCase() in options.ajax.trackMethods
      return true

  return false

_intercept = null
getIntercept = ->
  if not _intercept?
    _intercept = new RequestIntercept(options, shouldTrack)
  _intercept

shouldIgnoreURL = (url) ->
  for pattern in options.ajax.ignoreURLs
    if typeof pattern is 'string'
      if url.indexOf(pattern) isnt -1
        return true

    else
      if pattern.test(url)
        return true

  return false

# If we want to start the progress bar
# on every request, we need to hear the request
# and then inject it into the new ajax monitor
# start will have created.

getIntercept().on 'request', ({type, request, url}) ->
  return if shouldIgnoreURL(url)

  if not Pace.running and (options.restartOnRequestAfter isnt false or shouldTrack(type) is 'force')
    args = arguments

    after = options.restartOnRequestAfter or 0
    if typeof after is 'boolean'
      after = 0

    setTimeout ->
      if type is 'socket'
        stillActive = request.readyState < 2
      else
        stillActive = 0 < request.readyState < 4

      if stillActive
        Pace.restart()

        for source in Pace.sources
          if source instanceof AjaxMonitor
            source.watch args...
            break
    , after

class AjaxMonitor
  constructor: ->
    @elements = []

    getIntercept().on 'request', => @watch arguments...

  watch: ({type, request, url}) ->
    return if shouldIgnoreURL(url)

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
      , false

      for event in ['load', 'abort', 'timeout', 'error']
        request.addEventListener event, =>
          @progress = 100
        , false

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
      , false

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

    samples = []

    points = 0
    last = now()
    interval = setInterval =>
      diff = now() - last - 50
      last = now()

      samples.push diff

      if samples.length > options.eventLag.sampleCount
        samples.shift()

      avg = average samples

      if ++points >= options.eventLag.minSamples and avg < options.eventLag.lagThreshold
        @progress = 100

        clearInterval interval
      else
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
Pace.running = false

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
  Pace.sources = sources = []

  for type in ['ajax', 'elements', 'document', 'eventLag']
    if options[type] isnt false
      sources.push new SOURCE_KEYS[type](options[type])

  for source in options.extraSources ? []
    sources.push new source(options)

  Pace.bar = bar = new Bar(options)

  # Each source of progress data has it's own scaler to smooth its output
  scalers = []

  # We have an extra scaler for the final output to keep things looking nice as we add and
  # remove sources
  uniScaler = new Scaler

Pace.stop = ->
  Pace.trigger 'stop'
  Pace.running = false

  bar.destroy()

  # Not all browsers support cancelAnimationFrame
  cancelAnimation = true

  if animation?
    cancelAnimationFrame? animation
    animation = null

  init()

Pace.restart = ->
  Pace.trigger 'restart'
  Pace.stop()
  Pace.start()

Pace.go = ->
  Pace.running = true

  bar.render()

  start = now()

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

    if bar.done() or done or cancelAnimation
      bar.update 100

      Pace.trigger 'done'

      setTimeout ->
        bar.finish()

        Pace.running = false

        Pace.trigger 'hide'
      , Math.max(options.ghostTime, Math.max(options.minTime - (now() - start), 0))
    else
      enqueueNextFrame()

Pace.start = (_options) ->
  extend options, _options

  Pace.running = true

  try
    bar.render()
  catch NoTargetError

  # It's usually possible to render a bit before the document declares itself ready
  if not document.querySelector('.pace')
    setTimeout Pace.start, 50
  else
    Pace.trigger 'start'
    Pace.go()

if typeof define is 'function' and define.amd
  # AMD
  define ['pace'], -> Pace
else if typeof exports is 'object'
  # CommonJS
  module.exports = Pace
else
  # Global
  if options.startOnPageLoad
    Pace.start()
