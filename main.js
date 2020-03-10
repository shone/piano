"use-strict";

if (location.protocol !== 'file:') {
  navigator.serviceWorker.register('service-worker.js', {scope: './'});
}

let recordedEvents = [];
let currentSongTimeSeconds = 0;
let recordingTickTimer = null;
let timestampOnLastRecordingEvent = null;

let playbackTimer = null;
const buttonsTouchedForPlayback = new Set();

const piano = document.getElementById('piano');

// Setup audio
const audioContext = new (window.AudioContext || window.webkitAudioContext);
for (const button of piano.getElementsByTagName('button')) {
  button.envelope = audioContext.createGain();
  button.envelope.gain.setValueAtTime(0, audioContext.currentTime);
  button.envelope.connect(audioContext.destination);

  button.osc = audioContext.createOscillator();
  button.osc.frequency.setValueAtTime(parseFloat(button.dataset.freq), audioContext.currentTime);
  button.osc.type = 'square';
  button.osc.connect(button.envelope);
  button.osc.start();
}

// So that multiple touches on the same button only result in one button activation and one note
// played, the number of simultaneous touches for each button is counted.
// Mouse, keyboard and touch events are all counted as touches.
for (const button of piano.getElementsByTagName('button')) {
  button.touches = 0;
}
function addTouchToPianoButton(button) {
  button.touches++;
  if (button.touches === 1) {
    onPianoButton(button.dataset.freq, true);
    button.classList.add('pressed');
  }
}
function removeTouchFromPianoButton(button) {
  button.touches--;
  if (button.touches === 0) {
    onPianoButton(button.dataset.freq, false);
    button.classList.remove('pressed');
  }
}

const touchMap = new Map();
piano.ontouchstart = piano.ontouchmove = event => {
  event.preventDefault();
  for (const touch of event.changedTouches) {
    const element = document.elementFromPoint(touch.clientX, touch.clientY);
    if (element && element.tagName === 'BUTTON' && element.closest('#piano')) {
      const previousButton = touchMap.get(touch.identifier);
      if (previousButton !== element) { // Has this touch moved to a different button?
        if (previousButton) {
          removeTouchFromPianoButton(previousButton);
        }
        touchMap.set(touch.identifier, element);
        addTouchToPianoButton(element);
      }
    }
  }
}
piano.ontouchend = piano.ontouchcancel = event => {
  for (const touch of event.changedTouches) {
    const button = touchMap.get(touch.identifier);
    if (button) {
      removeTouchFromPianoButton(button);
    }
    touchMap.delete(touch.identifier);
  }
}

piano.onmousedown = piano.onmouseover = event => {
  if (event.buttons == 1 && event.target.tagName === 'BUTTON') {
    addTouchToPianoButton(event.target);
    event.target.onmouseup = () => {
      removeTouchFromPianoButton(event.target);
      event.target.onmouseup = null;
    }
  }
}
piano.onmouseup = piano.onmouseout = event => {
  if (event.buttons == 1 && event.target.tagName === 'BUTTON') {
    removeTouchFromPianoButton(event.target);
  }
}

window.onkeydown = event => {
  if (document.activeElement === document.getElementById('current-song-title')) {
    return;
  }
  if (event.ctrlKey || event.shiftKey || event.altKey) {
    return;
  }
  if (event.key === 'r') {
    toggleRecording();
  } else if (event.key === ' ') {
    event.preventDefault();
    togglePlayback();
  } else {
    const button = piano.querySelector(`[data-key="${event.key}"]`);
    if (button && !button.isKeyDown) {
      document.body.classList.add('keyboard-enabled');
      event.preventDefault();
      button.isKeyDown = true; // To debounce repeated keydown events, from keys held down
      addTouchToPianoButton(button);
    }
  }
}
window.onkeyup = event => {
  const button = piano.querySelector(`[data-key="${event.key}"]`);
  if (button && button.isKeyDown) {
    button.isKeyDown = false;
    removeTouchFromPianoButton(button);
  }
}

function onPianoButton(freq, state) {
  if (audioContext.state === 'suspended') {
    // The AudioContext will initially be in a suspended state, and is only allowed
    // to be resumed here, in response to a user gesture.
    // See https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices#Autoplay_policy
    audioContext.resume();
  }
  const envelope = piano.querySelector(`[data-freq="${freq}"]`).envelope;
  envelope.gain.setValueAtTime(state ? 0.02 : 0, audioContext.currentTime);
  if (document.body.dataset.mode === 'recording') {
    const now = performance.now();
    const delay = now - timestampOnLastRecordingEvent;
    recordedEvents.push({freq, state, delay});
    timestampOnLastRecordingEvent = now;
    document.getElementById('play-button').disabled = false;
    document.getElementById('save-button').disabled = false;
  }
}

function toggleRecording() {
  if (document.body.dataset.mode !== 'recording') {
    stop();
    recordedEvents = [];
    document.getElementById('play-button').disabled = true;
    document.getElementById('save-button').disabled = true;
    timestampOnLastRecordingEvent = performance.now();
    currentSongTimeSeconds = 0;
    document.getElementById('current-song-time').textContent = '00:00';
    recordingTickTimer = setInterval(() => {
      currentSongTimeSeconds++;
      document.getElementById('current-song-time').textContent = secondsToDisplayString(currentSongTimeSeconds);
    }, 1000);
    document.body.dataset.mode = 'recording';
  } else {
    stop();
  }
}

function togglePlayback() {
  if (document.body.dataset.mode !== 'playing') {
    stop();
    play(recordedEvents);
  } else {
    stop();
  }
}

function play(events) {
  stop();
  if (audioContext.state === 'suspended') {
    // The AudioContext will initially be in a suspended state, and is only allowed
    // to be resumed here, in response to a user gesture.
    // See https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices#Autoplay_policy
    audioContext.resume();
  }
  document.body.dataset.mode = 'playing';
  const remainingEvents = events.slice();
  function playRemainingEvents() {
    const event = remainingEvents.shift();
    if (!event) {
      document.body.dataset.mode = 'stopped';
      buttonsTouchedForPlayback.clear();
      return;
    }
    playbackTimer = setTimeout(() => {
      const button = piano.querySelector(`[data-freq="${event.freq}"]`);
      if (event.state) {
        addTouchToPianoButton(button);
        buttonsTouchedForPlayback.add(button);
      } else {
        removeTouchFromPianoButton(button);
        buttonsTouchedForPlayback.delete(button);
      }
      playRemainingEvents();
    }, event.delay);
  }
  playRemainingEvents();
}

function stop() {
  if (document.body.dataset.mode === 'recording') {
    clearInterval(recordingTickTimer);
  } else if (document.body.dataset.mode === 'playing') {
    clearTimeout(playbackTimer);
    for (const button of buttonsTouchedForPlayback) {
      removeTouchFromPianoButton(button);
    }
    buttonsTouchedForPlayback.clear();
  }
  document.body.dataset.mode = 'stopped';
}

function save() {
  const song = {
    title: document.getElementById('current-song-title').value,
    events: recordedEvents,
    durationSeconds: currentSongTimeSeconds,
  };
  addSavedSong(song);
  const localStorageSongs = JSON.parse(localStorage.getItem('songs') || '[]');
  localStorageSongs.push(song);
  localStorage.setItem('songs', JSON.stringify(localStorageSongs));
}

function addSavedSong(song) {
  document.getElementById('saved-song-list').insertAdjacentHTML('beforeend', `
    <li>
      <span class="title"></span>
      <span class="time">${secondsToDisplayString(song.durationSeconds)}</span>
      <button class="play-button">Play</button>
      <button class="delete-button"></button>
    </li>
  `);
  const li = document.getElementById('saved-song-list').lastElementChild;
  li.querySelector('.title').textContent = song.title;
  li.querySelector('.play-button').onclick = () => play(song.events);
  li.querySelector('.delete-button').onclick = () => {
    const index = [...document.getElementById('saved-song-list').children].indexOf(li);
    const localStorageSongs = JSON.parse(localStorage.getItem('songs'));
    localStorageSongs.splice(index, 1);
    localStorage.setItem('songs', JSON.stringify(localStorageSongs));
    li.remove();
  }
}

const localStorageSongs = JSON.parse(localStorage.getItem('songs') || '[]');
for (const song of localStorageSongs) {
  addSavedSong(song);
}

function secondsToDisplayString(seconds) {
  return String(Math.floor(seconds / 60)).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0');
}
