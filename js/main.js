window.AudioContext = window.AudioContext || window.webkitAudioContext;
var context = new AudioContext();

var buffer, buffer2; //global variables for sample files

//master gain node
var master = context.createGain();
master.connect(context.destination);

function map(v, in_min, in_max, out_min, out_max) {
  return ((v - in_min) * (out_max - out_min)) / (in_max - in_min) + out_min;
}

//global varuables
var w, h;
var data;
var drawingdata = []; //an array that keeps the data
var voices = []; //an array for touch events - polyphonic
var voicesmono = []; //this will be used for mouse events - monophonic
var isloaded = false;
var X = 0;
var Y = 0;
var mouseState = false;
var helpvisible = true;

//control initial settings
var attack = 0.4;
var release = 0.4;
var density = 0.85;
var spread = 0.2;
var reverb = 0.5;
var pan = 0.1;
var trans = 1;

//the grain class
function grain(
  canvas,
  ctx,
  buffer,
  positionx,
  positiony,
  attack,
  release,
  spread,
  pan
) {
  var that = this; //for scope issues
  this.now = context.currentTime; //update the time value
  //create the source
  this.source = context.createBufferSource();
  this.source.playbackRate.value = this.source.playbackRate.value * trans;
  this.source.buffer = buffer;
  //create the gain for enveloping
  this.gain = context.createGain();

  //experimenting with adding a panner node - not all the grains will be panned for better performance
  var yes = Math.floor(Math.random() * 3);
  if (yes === 1) {
    this.panner = context.createPanner();
    this.panner.panningModel = "equalpower";
    this.panner.distanceModel = "linear";
    this.panner.positionX = (Math.random() - 0.5) * pan * 2;
    this.panner.positionY = 0;
    this.panner.positionZ = 0;
    //connections
    this.source.connect(this.panner);
    this.panner.connect(this.gain);
  } else {
    this.source.connect(this.gain);
  }

  this.gain.connect(master);

  //update the position and calcuate the offset
  this.positionx = positionx;
  this.offset = this.positionx * (buffer.duration / canvas.width); //pixels to seconds

  //update and calculate the amplitude
  this.positiony = positiony;
  this.amp = this.positiony / canvas.height;
  this.amp = map(this.amp, 0.0, 1.0, 1.0, 0.0) * 0.7;
  //parameters
  this.attack = attack * 0.4;
  this.release = release * 1.5;

  if (this.release < 0) {
    this.release = 0.1; // 0 - release causes mute for some reason
  }
  this.spread = spread;

  this.randomoffset = Math.random() * this.spread - this.spread / 2; //in seconds
  ///envelope
  this.source.start(
    this.now,
    Math.max(0, this.offset + this.randomoffset),
    this.attack + this.release
  ); //parameters (when,offset,duration)
  this.gain.gain.setValueAtTime(0.0, this.now);
  this.gain.gain.linearRampToValueAtTime(this.amp, this.now + this.attack);
  this.gain.gain.linearRampToValueAtTime(
    0,
    this.now + (this.attack + this.release)
  );

  //garbage collection
  this.source.stop(this.now + this.attack + this.release + 0.1);
  var tms = (this.attack + this.release) * 1000; //calculate the time in miliseconds
  setTimeout(function () {
    that.gain.disconnect();
    if (yes === 1) {
      that.panner.disconnect();
    }
  }, tms + 200);

  //drawing the lines
  ctx.strokeStyle = `rgb(${Math.random() * 125 + 125}, ${
    Math.random() * 250
  }, ${Math.random() * 250})`; //,(this.amp + 0.8) * 255
  //p.strokeWeight(this.amp * 5);
  this.randomoffsetinpixels = this.randomoffset / (buffer.duration / w);
  //p.background();

  ctx.beginPath();
  ctx.moveTo(this.positionx + this.randomoffsetinpixels, 0);
  ctx.lineTo(this.positionx + this.randomoffsetinpixels, canvas.height);
  ctx.stroke();

  setTimeout(function () {
    // p.background();
    ctx.clearRect(0, 0, w, h);

    ctx.beginPath();
    ctx.moveTo(that.positionx + that.randomoffsetinpixels, 0);
    ctx.lineTo(that.positionx + that.randomoffsetinpixels, canvas.height);
    ctx.stroke();
    // p.line();
  }, 200);
}

//the voice class
function voice(id) {
  this.touchid = id; //the id of the touch event
}

//play function for mouse event
voice.prototype.playmouse = function (canvas, ctx, e) {
  this.grains = [];
  this.grainscount = 0;
  var that = this; //for scope issues
  this.play = function () {
    //create new grain
    var g = new grain(
      canvas,
      ctx,
      buffer,
      e.clientX,
      e.clientY,
      attack,
      release,
      spread,
      pan
    );
    //push to the array
    that.grains[that.graincount] = g;
    that.graincount += 1;

    if (that.graincount > 20) {
      that.graincount = 0;
    }
    //next interval
    this.dens = map(density, 1, 0, 0, 1);
    this.interval = this.dens * 500 + 70;
    that.timeout = setTimeout(that.play, this.interval);
  };
  this.play();
};
//play function for touch events - this will get the position from touch events
voice.prototype.playtouch = function (canvas, ctx, positionx, positiony) {
  //this.positiony = positiony;
  this.positionx = positionx;
  this.positiony = positiony;
  this.grains = [];
  this.graincount = 0;

  var that = this; //for scope issues
  this.play = function () {
    //create new grain
    var g = new grain(canvas, ctx, buffer, X, Y, attack, release, spread, pan);

    //push to the array
    that.grains[that.graincount] = g;
    that.graincount += 1;

    if (that.graincount > 30) {
      that.graincount = 0;
    }
    //next interval
    this.dens = map(density, 1, 0, 0, 1);
    this.interval = this.dens * 500 + 70;
    that.timeout = setTimeout(that.play, this.interval);
  };
  this.play();
};

//stop method
voice.prototype.stop = function () {
  clearTimeout(this.timeout);
};

//loading the first sound with XML HTTP REQUEST
var request = new XMLHttpRequest();
request.open("GET", "audio/guitar.mp3", true);
request.responseType = "arraybuffer";
request.onload = function () {
  context.decodeAudioData(
    request.response,
    function (b) {
      buffer = b; //set the buffer
      data = buffer.getChannelData(0);
      isloaded = true;
      var canvas1 = document.getElementById("canvas");
      var ctx = canvas1.getContext("2d");
      //initialize the processing draw when the buffer is ready
      waveformdisplay(canvas1, ctx);
    },
    function () {
      console.log("loading failed");
    }
  );
};
request.send();

//processing - waveform display - canvas
function waveformdisplay(canvas, ctx) {
  let box = document.getElementById("waveform").getBoundingClientRect();
  w = box.width; //get the width
  h = box.height;
  canvas.width = w;
  canvas.height = h;
  //draw the buffer
  function drawBuffer() {
    var step = Math.ceil(data.length / w);
    var amp = h / 2;

    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);
    for (var i = 0; i < w; i++) {
      var min = 1.0;
      var max = -1.0;

      for (j = 0; j < step; j++) {
        var datum = data[i * step + j];
        if (datum < min) {
          min = datum;
        } else if (datum > max) {
          max = datum;
        }
      }
      //p.stroke(p.random(255),p.random(255),p.random(255));
      ctx.fillStyle = "#fff";
      ctx.fillRect(i, (1 + min) * amp, 1, Math.max(1, (max - min) * amp));
    }
  }

  function setup() {
    canvas.width = w;
    canvas.height = h;
    ctx.fillStyle = "#000";

    ctx.fillRect(0, 0, w, h);

    //change the size on resize
    $(window).resize(function () {
      let box = document.getElementById("waveform").getBoundingClientRect();
      w = box.width; //get the width
      h = box.height;

      canvas.width = w;
      canvas.height = h;
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, w, h);

      drawBuffer();
    });

    drawBuffer();
  }
  setup();
}

//processing - grain display and main interaction system
function grainsdisplay(canvas, ctx) {
  let box = document.getElementById("waveform").getBoundingClientRect();
  w = box.width; //get the width
  h = box.height;

  //setup
  function setup() {
    canvas.width = w;
    canvas.height = h;
    ctx.clearRect(0, 0, w, h);
    // p.frameRate(24);
    // p.noLoop();

    //change the size on resize
    $(window).resize(function () {
      let box = document.getElementById("waveform").getBoundingClientRect();
      w = box.width; //get the width
      h = box.height;
      canvas.width = w;
      canvas.height = h;
      ctx.clearRect(0, 0, w, h);
    });
  }
  setup();
  //mouse events
  $("#canvas2")
    .mousedown(function (e) {
      mouseState = true;

      if (mouseState) {
        var v = new voice();
        v.playmouse(canvas, ctx, e);
        voicesmono[0] = v; //have in the array
      }
    })
    .mouseup(function () {
      mouseState = false;
      for (var i = 0; i < voicesmono.length; i++) {
        voicesmono[i].stop();
        voicesmono.splice(i);
      }
      setTimeout(function () {
        ctx.clearRect(0, 0, w, h);
      }, 300);
    })
    .mousemove(function (e) {
      X = e.clientX;
      Y = e.clientY;
    });
  //safety for when the mouse is out of the canvas
  $(document).mousemove(function (e) {
    if (e.target.id !== "canvas2") {
      for (var i = 0; i < voicesmono.length; i++) {
        voicesmono[i].stop();
        voicesmono.splice(i);
        setTimeout(function () {
          ctx.clearRect(0, 0, w, h);
        }, 300);
      }
    }
  });

  //touch events
  var canvas2 = document.getElementById("canvas2");
  canvas2.addEventListener("touchstart", function (event) {
    event.preventDefault(); //to prevent scrolling

    //4 touches glitches on ipad
    if (event.touches.length < 4) {
      for (var i = 0; i < event.touches.length; i++) {
        if (event.touches[i].target.id === "canvas2") {
          var id = event.touches[i].identifier; //the id will be used for voice stop
          var v = new voice(id);
          var clientX = event.touches[i].clientX;
          var clientY = event.touches[i].clientY;

          //multitouch optimization
          var interval;
          //calculate the reverse interval
          if (event.touches.length > 1) {
            interval = map(density, 0, 1, 1, 0.7);
          } else {
            interval = map(density, 0, 1, 1, 0);
          }

          //play
          v.playtouch(canvas, ctx, clientX, clientY, interval);
          voices.push(v);
        }
      }
    }
  });

  canvas2.addEventListener("touchend", function (event) {
    for (var i = 0; i < voices.length; i++) {
      for (var j = 0; j < event.changedTouches.length; j++) {
        if (voices[i].touchid === event.changedTouches[j].identifier) {
          voices[i].stop();
        }
      }
    }

    //safety and garbage collection
    if (event.touches.length < 1) {
      for (var i = 0; i < voices.length; i++) {
        voices[i].stop();
      }
      voices = [];
      setTimeout(function () {
        ctx.clearRect(0, 0, w, h);
      }, 200);
    }
  });

  canvas2.addEventListener("touchmove", function (event) {
    event.preventDefault();

    for (var i = 0; i < voices.length; i++) {
      for (var j = 0; j < event.changedTouches.length; j++) {
        if (voices[i].touchid === event.changedTouches[j].identifier) {
          if (event.changedTouches[j].clientY < h + 50) {
            voices[i].positiony = event.changedTouches[j].clientY;
            voices[i].positionx = event.changedTouches[j].clientX;
          } else {
            voices[i].stop();
          }
        }
      }
    }
  });
}

//onload
$(document).ready(function () {
  window.history.pushState(null, null, "");
  //grain display init
  var canvas2 = document.getElementById("canvas2");

  var ctx = canvas2.getContext("2d");
  grainsdisplay(canvas2, ctx);

  document.addEventListener("touchmove", function (e) {
    e.preventDefault();
  });
  //gui
  guiinit();
});
