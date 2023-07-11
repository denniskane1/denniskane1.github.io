//Imports«

import { util, api as capi } from "/sys/util.js";
import {globals} from "/sys/config.js";

const{ log, cwarn, cerr, isnum, make, mkdv} = util;
//»

export const app = function(Win, Desk) {
//log(Win);
//Var«

let Main = Win.main;
let statbar = Win.status_bar;
Main._tcol="#ccc";

let midi = globals.midi;

let NOTEDUR = 0.3;
let NOTEDUR_OFF = 0;
let NOTEDUR_MIN = 0.025;
let NOTE_OFFSET = 0.025;
let NOTE_OFFSET_OFF = 0;

let MEASURE_LENGTH = 13;
let BEATS_PER_MEASURE = 7;
let BEATS_PER_MEASURE_OFF_RANGE = 6;
let BEATS_PER_MEASURE_OFF = 0;

let BPM = 280;
let BPM_OFF = 0;
let BEATS_PER_SEC = BPM / 60;
//log("BPS",BEATS_PER_SEC);
let NEW_BEATS_PER_SEC = BEATS_PER_SEC;

let rafId;

let paused = true;

let measure = [];
let cur_measure;

let time_elapsed = 0;
let last_time;
let last_measure = -1;

let KEY = "C2";
let SCALE = "Maj";
let NUM_OCTAVES = 3;

let MEASURE_NOTE_SPREAD = 9;
let MEASURE_NOTE_SPREAD_OFF = 0;

let MEASURE_NOTE_SPREAD_OFF_SPREAD = 10;

let KEY_START = 30;
let KEY_SPREAD = 20;

const MAJ = [2,2,1,2,2,2,1];
const NAT = [2,1,2,2,1,2,2];
//const HAR = [2,1,2,2,1,3,1];

const NOTE_TO_MIDI={};
const MIDI_TO_NOTE=[];

const MIDINOTES=(()=>{//«
//const noteToFreq=note=>{
//    let a = 440; //frequency of A (common value is 440Hz)
//    return (a / 32) * (2 ** ((note - 9) / 12));
//} 
	let arr = [];
	for (let i=0; i < 128; i++) arr[i]=13.75*(2**((i-9)/12));
	return arr;
})();//»
const NOTEMAP=(()=>{//«
	let notes=["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
	let obj = {};
	let iter=0;
	OUTERLOOP: for (let j=-1; j <= 9; j++){
		for (let i=0; i < notes.length; i++){
			if (iter>127) break OUTERLOOP;
			let n = notes[i];
			let s = `${n}${j}`;
			let v = MIDINOTES[iter];
			obj[s] = v;
			MIDI_TO_NOTE[iter] = s;
			NOTE_TO_MIDI[s]=iter;
			if (n=="C#") {
				obj[`Db${j}`]=v;
				NOTE_TO_MIDI[`Db${j}`]=iter;
			}
			else if (n=="D#") {
				obj[`Eb${j}`]=v;
				NOTE_TO_MIDI[`Eb${j}`]=iter;
			}
			else if (n=="F#") {
				obj[`Gb${j}`]=v;
				NOTE_TO_MIDI[`Gb${j}`]=iter;
			}
			else if (n=="G#") {
				obj[`Ab${j}`]=v;
				NOTE_TO_MIDI[`Ab${j}`]=iter;
			}
			else if (n=="A#") {
				obj[`Bb${j}`]=v;
				NOTE_TO_MIDI[`Bb${j}`]=iter;
			}
			else if (n=="E") {
				obj[`Fb${j}`] = v;
				NOTE_TO_MIDI[`Fb${j}`]=iter;
			}
			else if (n=="F") {
				obj[`E#${j}`] = v;
				NOTE_TO_MIDI[`E#${j}`]=iter;
			}
			else if (n=="C") {
				obj[`B#${j}`] = MIDINOTES[iter+12];
				NOTE_TO_MIDI[`B#${j}`]=iter+12;
			}
			else if (n=="B") {
				obj[`Cb${j}`] = MIDINOTES[iter-12];
				NOTE_TO_MIDI[`Cb${j}`]=iter-12;
			}
			iter++;
		}
	}
	return obj;
})();//»

let gain_queue=[];
let MAX_QUEUE_LENGTH = 60;
//let start
/*
let start = NOTE_TO_MIDI[KEY];
let NOTES=[];
for (let i=0; i < MAJ.length*NUM_OCTAVES; i++){
	NOTES.push(MIDI_TO_NOTE[start]);
	start+=MAJ[i%MAJ.length];
}
let num_notes = NOTES.length;
*/
let NOTES;
let num_notes;
let CURVE_VALS = [0,0.25,0.20,0.20,0.20,0.10,0];
//let CURVE_VALS = [0,0.33,0];


//»
//WebAudio«

let ctx = globals.audioCtx || new AudioContext();
globals.audioCtx = ctx;

//let TYPE="sawtooth";
let TYPE="triangle";
//let TYPE="square";
//let TYPE="sine";

let filterGain = ctx.createGain();
let bypassGain = ctx.createGain();
bypassGain.connect(ctx.destination);
//filterGain.gain.value = 1.0;
//filterGain.connect(ctx.destination);

let filters=[];
let filter_freqs=[
    100,
    200, 
    400, 
    800 
]; 
/*
for (let freq of filter_freqs){
	let filt = ctx.createBiquadFilter();
	filt.type="bandpass";
	filt.frequency.value = freq;
	filt.Q.value = 1;
	filterGain.connect(filt);
	filt.connect(ctx.destination);
	filters.push(filt);
}
*/
//gain.connect(auctx.destination);


//»
//Funcs«

let TOTAL_MEASURES = 25;

let BPM_SPREAD = 300;

const set_beats_per_sec=()=>{
	BEATS_PER_SEC = (BPM + (-BPM_SPREAD/2 + Math.floor(BPM_SPREAD*Math.random())))/60;
cwarn("BPM", 60*BEATS_PER_SEC);
//60 s/m b/s
};
const main_loop = stamp => {//«

stamp *= BEATS_PER_SEC;

if (last_time) time_elapsed += stamp - last_time;
last_time = stamp;

let overall_beatnum = Math.floor(time_elapsed/1000);

let measure_num = Math.floor(overall_beatnum / MEASURE_LENGTH);
//log(measure_num, TOTAL_MEASURES);
if (measure_num == TOTAL_MEASURES){

	time_elapsed = 0;
	last_time = null;
	last_measure = -1;
	set_beats_per_sec();
	rafId = requestAnimationFrame(main_loop);
	return;
}


let beatnum = overall_beatnum % MEASURE_LENGTH;
if (measure_num > last_measure){

if (!(measure_num % 7)){
	BEATS_PER_MEASURE_OFF = Math.floor(BEATS_PER_MEASURE_OFF_RANGE*Math.random()) - BEATS_PER_MEASURE_OFF_RANGE/2;
}

if (!(measure_num % 5)){
let num = KEY_START+Math.floor(KEY_SPREAD*Math.random());
change_key(num);
}

if (!(measure_num % 3)) {
	make_measure();
}

if (!(measure_num % 4)){
	NOTEDUR_OFF = 0.003 * (-64 + Math.floor(128*Math.random()));
}

if (!(measure_num % 8)){
	NOTE_OFFSET_OFF = 0.0005 * (-64 + Math.floor(128*Math.random()));
}

	cur_measure = [];
	for (let i=0; i < MEASURE_LENGTH; i++) {
		cur_measure.push(0);
	}
}
if (!cur_measure[beatnum]){


	let num = measure[beatnum];
//	if (measure[beatnum]){
	if (num){

		let usenotedur = NOTEDUR_OFF + NOTEDUR;
		if (usenotedur < NOTEDUR_MIN) usenotedur = NOTEDUR_MIN;
//log(usenotedur);
		let usenoteoff = NOTE_OFFSET + NOTE_OFFSET_OFF;
		if (usenoteoff < 0) usenoteoff = 0;

		let o1 = ctx.createOscillator();
		let g1 = ctx.createGain();
		g1.gain.value=0;
		o1.type = TYPE;
		o1.start();
		let o2 = ctx.createOscillator();
		let g2 = ctx.createGain();
		g2.gain.value=0;
		o2.type = TYPE;
		o2.start();
		let o3 = ctx.createOscillator();
		let g3 = ctx.createGain();
		g3.gain.value=0;
		o3.type = TYPE;
		o3.start();
		let o4 = ctx.createOscillator();
		let g4 = ctx.createGain();
		g4.gain.value=0;
		o4.type = TYPE;
		o4.start();

		o1.connect(g1);
		o2.connect(g2);
		o3.connect(g3);
		o4.connect(g4);

//		g1.connect(filterGain);
//		g2.connect(filterGain);
//		g3.connect(filterGain);
//		g4.connect(filterGain);

		g1.connect(bypassGain);
		g2.connect(bypassGain);
		g3.connect(bypassGain);
		g4.connect(bypassGain);

		o1.frequency.value = NOTEMAP[NOTES[num]];
		o2.frequency.value = NOTEMAP[NOTES[num+2]];
		o3.frequency.value = NOTEMAP[NOTES[num+4]];
		o4.frequency.value = NOTEMAP[NOTES[num+6]];
		let tm = ctx.currentTime;
		g1.gain.setValueCurveAtTime(CURVE_VALS,tm, usenotedur);
		g2.gain.setValueCurveAtTime(mult(CURVE_VALS,0.8),tm+usenoteoff, usenotedur);
		g3.gain.setValueCurveAtTime(mult(CURVE_VALS,0.6),tm+2*usenoteoff, usenotedur);
		g4.gain.setValueCurveAtTime(mult(CURVE_VALS,0.4),tm+3*usenoteoff, usenotedur);
//		gain_queue.push(g1, g2, g3);
		gain_queue.push(g1, g2, g3, g4);

	}
	else{
//log(gain_queue.length);
while (gain_queue.length > MAX_QUEUE_LENGTH){
let g=gain_queue.shift();
g.disconnect();
}
	}
}

cur_measure[beatnum] = 1;
last_measure = measure_num;
rafId = requestAnimationFrame(main_loop);


};//»

const get_midi = () => {//«

let midi;
let midi_cbs=[];
let did_get_midi = false;
let num_midi_inputs = 0;
let did_get_inputs = false;

const Midi = function(){//«
	this.set_cb=(cb)=>{
		midi_cbs.push(cb);
	};
	this.rm_cb=cb=>{
		let ind = midi_cbs.indexOf(cb);
		if (ind < 0) return;
		midi_cbs.splice(cb, 1);
	};
}//»

return new Promise((Y,N)=>{

const midi_in=(mess)=>{//«
	if (!did_get_midi) {
cwarn("Midi UP!");
		did_get_midi = true;
	}
	for (let cb of midi_cbs) {
		cb(mess);
	}
}//»
navigator.requestMIDIAccess({sysex: false}).then(//«
	(midiarg)=>{//«
		function getinputs(e){//«
			if (e) {
				if (e instanceof MIDIConnectionEvent) {
					globals.midi = new Midi();
					Y(true);
				}
				else {
cwarn("WHAT MIDISTATECHANGE EVENT?");
log(e);
				}
			}
			let inputs = midi.inputs.values();
			num_midi_inputs = 0;
			for (let input = inputs.next(); input && !input.done; input = inputs.next()) {
				if (!input.value.name.match(/^Midi Through Port/)) {
					num_midi_inputs++;
					input.value.onmidimessage = midi_in;
				}
			}
			if (num_midi_inputs) {
				if (!did_get_inputs) {
cwarn("MIDI: connected ("+num_midi_inputs+")");
					did_get_inputs = true;
				}
			}
			else {
				for (let cb of midi_cbs) {
//					if (cb) cb({EOF: true});
				}
				midi_cbs = [];
				did_get_inputs = false;
			}
		}//»
		midi = midiarg;
		midi.onstatechange = getinputs;
		getinputs();
	},//»
	(err)=>{
cerr("navitagor.requestMIDIAccess():",err);
Y();
	});

//»

});
}//»
const midi_cb = e => {//«

//if (!gain) return;

let dat = e.data;
let v1 = dat[0]
let v2 = dat[1]
let v3 = dat[2]
//log(dat);
if (v1==128){


change_key(v2);

/*«
NOTES=[];
let start = v2;
for (let i=0; i < MAJ.length*NUM_OCTAVES; i++){
	NOTES.push(MIDI_TO_NOTE[start]);
	start+=MAJ[i%MAJ.length];
}
num_notes = NOTES.length;
»*/

}
else if (v1==176){//Knob

if (v2==1){
	bypassGain.gain.value = v3/127;
}
else if (v2==2) {
	filterGain.gain.value = v3/127;
}
else if (v2==3){
}
else if(v2 > 4){
	let v = 6*(v3-63.5)/127;
	let filt = filters[v2-5];
	filt.Q.value = 10**v;
}

}

//log(v1,v2,v3);

/*
if (v1==176 && v2 <= 8){//Knob
	if (v2==1){
		gain.gain.value = v3/127;
	}
	else if (v2==2){
		vid.setTimeByPer(v3/127);
	}
	else if(v2 > 4){
		let v = 6*(v3-63.5)/127;
		let filt = filters[v2-5];
		filt.Q.value = 10**v;
	}
}
else{
	if (v1==176){//CC Red
		if (v2 == 24){//Bank A/B Green, pad 1
			if (v3==0){
				if (!vid.paused) vid.pause();
			}
			else {
				if (vid.paused) vid.play();
			}
		}
	}
}
*/


};//»
const dogetmidi = async () => {//«

if (await get_midi()) {
	midi = globals.midi;
	midi.set_cb(midi_cb);
}
else{

cerr("NOPE");

}

};//»

const mult = (arr, val) => {//«
	let out = [];
	for (let num of arr) out.push(num*val);
	return out;
}//»
const change_key = start => {//«
	NOTES=[];
	for (let i=0; i < MAJ.length*NUM_OCTAVES; i++){
		NOTES.push(MIDI_TO_NOTE[start]);
		start+=MAJ[i%MAJ.length];
	}
	num_notes = NOTES.length;
//log(NOTES);
};//»
const toggle_paused = () => {//«
	if (paused) {
		last_time = null;
		rafId = requestAnimationFrame(main_loop);
	}
	else {
		cancelAnimationFrame(rafId);
	}
	paused = !paused;
}//»


const make_measure = () => {//«

	MEASURE_NOTE_SPREAD_OFF = -Math.round(MEASURE_NOTE_SPREAD_OFF_SPREAD/2) + Math.floor(MEASURE_NOTE_SPREAD_OFF_SPREAD*Math.random());
	let got_beats = 0;
	let use_beats_per_measure = BEATS_PER_MEASURE + BEATS_PER_MEASURE_OFF;
	let use_measure_note_spread = MEASURE_NOTE_SPREAD + MEASURE_NOTE_SPREAD_OFF;

	measure = [];
	for (let i=0; i < MEASURE_LENGTH; i++) measure[i]=0;
	while (got_beats < use_beats_per_measure){
		let rand = Math.floor(MEASURE_LENGTH * Math.random());
		if (!measure[rand]){
			got_beats++;
//			measure[rand] = Math.floor(Math.random()*(num_notes-6));
			measure[rand] = Math.floor(Math.random()*use_measure_note_spread);
		}
	}

};//»

const stat_memory=()=>{//«
    let mem = window.performance.memory;
    let lim = mem.jsHeapSizeLimit;
    let used = mem.usedJSHeapSize;
    let per = Math.floor(100*used/lim);

    let limmb = Math.round(lim/1048576);
    let usedmb = Math.round(used/1048576);
    statbar.innerHTML=`Memory: ${usedmb}MB/${limmb}MB  (${per}%)`;
};//»

//»
//OBJ/CB«

this.onresize=()=>{//«
};//»
this.onappinit=()=>{//«
}//»
this.onkill=()=>{//«

filterGain.disconnect();
bypassGain.disconnect();

cancelAnimationFrame(rafId);
midi && midi.rm_cb(midi_cb);

};//»
this.onkeydown=(e,k)=>{//«

if (k=="SPACE_"){
	toggle_paused();
}
else if(k=="r_"){
	time_elapsed = 0;
	last_time = null;
	last_measure = -1;
	BEATS_PER_SEC = NEW_BEATS_PER_SEC;
}

};//»

//»

//make_measure();
if (midi) midi.set_cb(midi_cb);
else dogetmidi();
set_beats_per_sec();
//log(midi);
//log(NOTEMAP);
//log(NOTE_TO_MIDI);
//log(MIDI_TO_NOTE);
}

