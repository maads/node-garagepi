var path = require('path');

var fs = require('fs');
var rfs = require('rotating-file-stream')

var logger = require('morgan');
var bodyParser = require('body-parser');
var GPIO = require("onoff").Gpio;
var express = require('express');
var app = express();
var server = require('http').Server(app);
var io = require('socket.io')(server);
var startTakingSnaps = false;

require('console-stamp')(console, '[HH:MM:ss]');

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.engine('html', require('ejs').renderFile);

// Logging
var logDirectory = path.join(__dirname, 'log');
// ensure log directory exists
fs.existsSync(logDirectory) || fs.mkdirSync(logDirectory);
// create a rotating write stream
var accessLogStream = rfs('access.log', {
  interval: '1d', // rotate daily
  path: logDirectory
});
// setup the logger
app.use(morgan('combined', {stream: accessLogStream}))

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', function(req, res) {
  res.render('index.html');
});

var state = 'closed';
app.get('/api/clickbutton', function(req, res) {
  state = state == 'closed' ? 'open' : 'closed';

  // hardcode to closed for now until reed switch
  state = 'closed';
  res.setHeader('Content-Type', 'application/json');
  res.end(state);
  outputSequence(7, '10', 1000);
});

app.get('/api/status', function(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ state: state }));
  console.log('returning state: ' + state);
});

function outputSequence(pin, seq, timeout) {
  var gpio = new GPIO(4, 'out');
  gpioWrite(gpio, pin, seq, timeout);
}

function gpioWrite(gpio, pin, seq, timeout) {
  if (!seq || seq.length <= 0) { 
    console.log('closing pin:', pin);
    gpio.unexport();
    return;
  }

  var value = seq.substr(0, 1);
  seq = seq.substr(1);
  setTimeout(function() {
    console.log('gpioWrite, value:', value, ' seq:', seq);
    gpio.writeSync(value);
    gpioWrite(gpio, pin, seq, timeout);
  }, timeout);
}

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  var err = new Error('Not Found');
  err.status = 404;
  next(err);
});

function takeSnaps() {
  var autoSnapshot = setTimeout(function() {
    var imgPath = path.join(__dirname, 'public/images');
    var cmd = 'raspistill -vf -hf -w 640 -h 480 -ex auto -q 100 -e png -sh 100 -o ' + imgPath + '/garage.png';
    var exec = require('child_process').exec;
    exec(cmd, function (error, stdout, stderr) {
      if (error !== null) {
        console.log('exec error: ' + error);
        return;
      }
      io.emit('snapshot', 'ready');
      console.log('snapshot created...');
      if(startTakingSnaps) {
        takeSnaps();
      }
    });
  }, 0);

  return autoSnapshot;
}

io.on('connection', function(socket){
  console.log('a user connected');
  startTakingSnaps = true;
  takeSnaps();

  socket.on('disconnect', function(){
    console.log('user disconnected');
    startTakingSnaps = false;
  });
});

var port = process.env.PORT || 8000;
server.listen(port, function() {
  console.log('GaragePi listening on port:', port);
});
