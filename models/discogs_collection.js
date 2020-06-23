const mongoose = require('mongoose');

const artistObject = {
  id: String,
  name: String,
  link: String,
};

const compatibilityObject = {
  album: {
    id: String,
    name: String,
    release_date: String,
    picture: String,
    link: String,
    upc: String,
    nb_tracks: Number,
    artists: [artistObject],
  },
  tracks: [{
    id: String,
    name: String,
    isrc: Number,
    duration: String,
    link: String,
    artists: [artistObject],
  }]
};

const DiscogsCollectionSchema = new mongoose.Schema({
    //user : { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    discogs: compatibilityObject,
    deezer: {type: {...
      [compatibilityObject],
      validity_score: Number,
      validity_percent: String,
    }, required: false},
    spotify: {type: {...
      [compatibilityObject],
      validity_score: Number,
      validity_percent: String,
    }, required: false},
});

mongoose.model('DiscogsCollection', DiscogsCollectionSchema);
