'use strict';
const {getLatLngFromDigiPin}=require('../vendor/indiapost/digipin');
const {fields,LiteError}=require('./security');
function coordinates(input){
  fields(input,['digipin'],['digipin']);
  if(typeof input.digipin!=='string'||input.digipin.length>30)throw new LiteError('INVALID_DIGIPIN');
  const digipin=input.digipin.replace(/[\s-]/g,'').toUpperCase();
  if(!/^[23456789CJKLMPFT]{10}$/.test(digipin))throw new LiteError('INVALID_DIGIPIN');
  const value=getLatLngFromDigiPin(digipin);
  return {digipin,latitude:Number(value.latitude),longitude:Number(value.longitude),precision:'grid-centre'};
}
module.exports={coordinates};
