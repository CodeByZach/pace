# How long should it take for the bar to animate to a new
# point after receiving it
CATCHUP_TIME = 500

# How quickly should the bar be moving before it has any progress
# info from a new source in %/ms
INITIAL_RATE = .03

# What is the minimum amount of time the bar should be on the
# screen
MIN_TIME = 500

# What is the minimum amount of time the bar should sit after the last
# update before disappearing
GHOST_TIME = 250

# How frequently in ms should we check for the elements being tested for
# using the element monitor?
ELEMENT_CHECK_INTERVAL = 100

# Its easy for a bunch of the bar to be eaten in the first few frames
# before we know how much there is to load.  This limits how much of
# the bar can be used per frame
MAX_PROGRESS_PER_FRAME = 10

# This tweaks how the animation easing looks
EASE_FACTOR = 1.25

now = ->
  performance?.now?() ? +new Date

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

avgKey = (arr, key, args...) ->
  sum = 0
  for item in arr
    sum += result(item, key, args...)

  sum / arr.length

class Bar
  constructor: ->
    @progress = 0

  getElement: ->
    if not @el?
      @el = document.createElement 'div'
      @el.className = 'pace'

      @el.innerHTML = '''
      <div class="pace-progress">
        <div class="pace-progress-inner"></div>
      </div>
      <div class="pace-activity"></div>'''

      if document.body.firstChild?
        document.body.insertBefore @el, document.body.firstChild
      else
        document.body.appendChild @el

    @el

  hide: ->
    @getElement().style.display = 'none'

  update: (prog) ->
    @progress = prog

    do @render

  destroy: ->
    @getElement().parentNode.removeChild(@getElement)

    @el = undefined

  render: ->
    if not document.body?
      return false

    $(@getElement()).find('.pace-progress').css width: "#{ @progress }%"

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
class RequestIntercept extends Events
  constructor: ->
    super

    _intercept = @

    window.XMLHttpRequest = ->
      req = new _XMLHttpRequest

      _open = req.open
      req.open = (type, url, async) ->
        _intercept.trigger 'request', {type, url, request: req}

        _open.apply req, arguments

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

    size = null
    request.onprogress = =>
      try
        headers = request.getAllResponseHeaders()

        for name, val of headers
          if name.toLowerCase() is 'content-length'
            size = +val
            break

      catch e

      if size?
        # This is not perfect, as size is in bytes, length is in chars
        try
          @progress = request.responseText.length / size
        catch e
      else
        # If it's chunked encoding, we have no way of knowing the total length of the
        # response, all we can do is incrememnt the progress with backoff such that we
        # never hit 100% until it's done.
        @progress = @progress + (100 - @progress) / 2

    request.onload = request.onerror = request.ontimeout = request.onabort = =>
      @progress = 100

class ElementMonitor
  constructor: (selectors...) ->
    @elements = []

    for set in selectors
      @elements.push new ElementTracker set
    
class ElementTracker
  constructor: (selectors) ->
    @progress = 0

    if typeof selectors is 'string'
      @selector = selectors
    else
      @selector = selectors.join(',')

    @check()

  check: ->
    if document.querySelector(@selector)
      @done()
    else
      setTimeout (=> @check()),
        ELEMENT_CHECK_INTERVAL

  done: ->
    @progress = 100

class DocumentMonitor
  states:
    loading: 0
    interactive: 50
    complete: 100

  constructor: ->
    @progress = 0

    document.onreadystatechange = =>
      if @states[document.readyState]?
        @progress = @states[document.readyState]

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
    @rate = 0.03
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

      @catchup = (val - @progress) / CATCHUP_TIME

      @sinceLastUpdate = 0
      @last = val

    if val > @progress
      # After we've got a datapoint, we have CATCHUP_TIME to
      # get the progress bar to reflect that new data
      @progress += @catchup * frameTime

    scaling = (1 - Math.pow(@progress / 100, EASE_FACTOR))

    # Based on the rate of the last update, we preemptively update
    # the progress bar, scaling it so it can never hit 100% until we
    # know it's done.
    @progress += scaling * @rate * frameTime

    @progress = Math.max(0, @progress)
    @progress = Math.min(100, @progress)

    @progress = Math.min(@lastProgress + MAX_PROGRESS_PER_FRAME, @progress)
    @lastProgress = @progress

    @progress

sources = null
scalers = null
bar = null
uniScaler = null
animation = null

if window.pushState?
  _pushState = window.pushState
  window.pushState = ->
    handlePageChange()

    _pushState arguments...

if window.replaceState?
  _replaceState = window.replaceState
  window.replaceState = ->
    handlePageChange()

    _replaceState arguments...

do init = ->
  sources = [new AjaxMonitor, new ElementMonitor('body'), new DocumentMonitor, new EventLagMonitor]
  scalers = []

  bar = new Bar
  uniScaler = new Scaler

reset = ->
  bar.destroy()

  if animation?
    cancelAnimationFrame animation
    animation = null

  init()

handlePageChange = ->
  reset()
  go()

go = ->
  bar.render()

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
    if bar.done() or done
      bar.update 100

      setTimeout ->
        bar.hide()
      , Math.max(GHOST_TIME, Math.min(MIN_TIME, now() - start))
    else
      enqueueNextFrame()

do check = ->
  bar.render()

  if not document.querySelector('.pace')
    setTimeout check, 50
  else
    go()

