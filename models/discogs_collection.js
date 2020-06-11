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
    upc: Number,
    nb_tracks: Number,
    artists: [artistObject],
  },
  tracks: [{
    id: String,
    name: String,
    isrc: Number,
    duration: Number,
    link: String,
    artists: [artistObject],
  }]
};

const DiscogsCollectionSchema = new mongoose.Schema({
    //user : { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    discogs: Object, // compatibilityObject
    deezer: Object,
    spotify: Object,
});

mongoose.model('DiscogsCollection', DiscogsCollectionSchema);