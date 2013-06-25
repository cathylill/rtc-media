var crel = require('crel'),
    extend = require('cog/extend'),
    qsa = require('cog/qsa'),
    detect = require('feature/detect'),
    EventEmitter = require('events').EventEmitter,
    util = require('util');

// monkey patch getUserMedia from the prefixed version
navigator.getUserMedia = detect.call(navigator, 'getUserMedia');

// patch window url
window.URL = window.URL || detect('URL');

// patch media stream
window.MediaStream = detect('MediaStream');

/**
# Media
*/
function Media(opts) {
    if (! (this instanceof Media)) {
        return new Media(opts);
    }

    // inherited
    EventEmitter.call(this);

    // if the opts is a media stream instance, then handle that appropriately
    if (opts instanceof MediaStream) {
        opts = {
            stream: opts,
            start: false,
            muted: false
        };
    }

    // ensure we have opts
    opts = extend({}, {
        start: true,
        muted: true,
        constraints: {
            video: true,
            audio: false
        }
    }, opts);

    // save the constraints
    this.constraints = opts.constraints;

    // if a name has been specified in the opts, save it to the media
    this.name = opts.name;

    // initialise the stream to null
    this.stream = opts.stream || null;

    // create a bindings array so we have a rough idea of where we have been attached to
    // TODO: revisit whether this is the best way to manage this
    this._bindings = [];

    // if we are autostarting, then start
    if (opts.start) {
        this.start();
    }
}

util.inherits(Media, EventEmitter);

/**
## attach(target)

Attach the media stream to the target element
*/
Media.prototype.render = function(targets, opts, stream) {
    // if the stream is not provided, then use the current stream
    stream = stream || this.stream;

    // ensure we have opts
    opts = opts || {};

    // if no stream was specified, wait for the stream to initialize
    if (! stream) {
        return this.once('start', this.render.bind(this, targets, opts));
    }

    // use qsa to get the targets
    if (typeof targets == 'string' || (targets instanceof String)) {
        targets = qsa(targets);
    }
    // otherwise, make sure we have an array
    else {
        targets = [].concat(targets || []);
    }

    // bind the stream to all the identified targets
    targets.filter(Boolean).forEach(this._bindStream.bind(this, stream, opts));
};

/**
## start(constraints, callback)

Start the media capture.  If constraints are provided, then they will override the default 
constraints that were used when the media object was created.
*/
Media.prototype.start = function(constraints, callback) {
    var media = this,
        handleEnd = this.emit.bind(this, 'stop');

    // if we already have a stream, then abort
    if (this.stream) return;

    // if no constraints have been provided, but we have a callback, deal with it
    if (typeof constraints == 'function') {
        callback = constraints;
        constraints = this.constraints;
    }

    // if we have a callback, bind to the start event
    if (typeof callback == 'function') {
        this.once('start', callback.bind(this));
    }

    // get user media, using either the provided constraints or the default constraints
    navigator.getUserMedia(
        constraints || this.constraints,
        function(stream) {
            if (typeof stream.addEventListener == 'function') {
                stream.addEventListener('ended', handleEnd);
            }
            else {
                stream.onended = handleEnd;
            }

            // save the stream and emit the start method
            media.stream = stream;
            media.emit('start', stream);
        },
        this._handleFail.bind(this)
    );
};

/**
## stop()

Stop the media stream
*/
Media.prototype.stop = function(opts) {
    var media = this;

    if (! this.stream) return;

    // remove bindings
    this._unbind(opts);

    // stop the stream, and tell the world
    this.stream.stop();

    // on start rebind
    this.once('start', function(stream) {
        media._bindings.forEach(function(binding) {
            media._bindStream(stream, binding.opts, binding.el);
        });
    });

    // remove the reference to the stream
    this.stream = null;
};

/**
## tx(peer)

Send this media stream to the peer
*/
Media.prototype.tx = function(peer) {
    
};

/* "private" methods */

/**
## _bindStream(element, stream)
*/
Media.prototype._bindStream = function(stream, opts, element) {
    var parent, objectUrl,
        validElement = (element instanceof HTMLVideoElement) || 
            (element instanceof HTMLAudioElement);

    // if the element is not a video element, then create one
    if (! validElement) {
        parent = element;

        // create a new video element
        // TODO: create an appropriate element based on the types of tracks available
        element = crel('video', {
            width: '100%',
            height: '100%',
            muted: typeof opts.muted == 'undefined' || true,
            preserveAspectRatio: typeof opts.preserveAspectRatio == 'undefined' || true
        });

        // add to the parent
        parent.appendChild(element);
    }

    // check for mozSrcObject
    if (typeof element.mozSrcObject != 'undefined') {
        element.mozSrcObject = stream;
    }
    else {
        element.src = this._createObjectURL(stream) || stream;
    }

    // attempt to play the video
    if (typeof element.play == 'function') {
        element.play();
    }

    // flag the element as bound
    this._bindings.push({
        el: element,
        opts: opts
    });
};

/**
## _unbind()

Gracefully detach elements that are using the stream from the current stream
*/
Media.prototype._unbind = function(opts) {
    // ensure we have opts
    opts = opts || {};

    // iterate through the bindings and detach streams
    this._bindings.forEach(function(binding) {
        var element = binding.el;

        // remove the source
        element.src = null;

        // check for moz
        if (element.mozSrcObject) {
            element.mozSrcObject = null;
        }

        // check for currentSrc
        if (element.currentSrc) {
            element.currentSrc = null;
        }
    });
};

/**
## _createObjectUrl(stream)

This method is used to create an object url that can be attached to a video or 
audio element.  Object urls are cached to ensure only one is created per stream.
*/
Media.prototype._createObjectURL = function(stream) {
    try {
        return window.URL.createObjectURL(stream);
    }
    catch (e) {
    }
};

/**
## _handleSuccess(stream)
*/
Media.prototype._handleSuccess = function(stream) {
    // update the active stream that we are connected to
    this.stream = stream;

    // emit the stream event
    this.emit('stream', stream);
};

/**
## _handleFail(evt)
*/
Media.prototype._handleFail = function(err) {
    // TODO: make this more friendly
    this.emit('error', new Error('Unable to capture requested media'));
};

module.exports = Media;
