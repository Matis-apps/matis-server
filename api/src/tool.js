const deezer = require('./deezer');
const spotify = require('./spotify');
const utils = require('../../utils');
const moment = require('moment');
const DiscogsCollection = require('mongoose').model('DiscogsCollection');
const fs = require('fs');
var util = require('util');
const filenameAlbumScore = __dirname+"/res/score-album.txt";
const filenameTrackScore = __dirname+"/res/score-track.txt";

function crossAlbumUPC (spotify_token, fromPlateform, query, upc) {
  return new Promise(async (resolve, reject) => {
    var plateforms = new Object;
    var hasResults = false;
    var error = null;
    if(fromPlateform != 'deezer') {
      const deezerResult = await deezer.searchAlbumUPC(query, upc)
        .then(result => {
          plateforms.deezer = result;
          hasResults = true;
        })
        .catch(err => error = err);
    }

    if(fromPlateform != 'spotify') {
      if (spotify_token) {
        const spotifyResult = await spotify.searchAlbumUPC(spotify_token, query, upc)
          .then(result => {
            plateforms.spotify = result;
            hasResults = true;
          })
          .catch(err => error = err);
      } else {
        error = utils.error("No access_token for Spotify", 401);
      }
    }

    if(hasResults) {
      resolve(plateforms)
    } else {
      if (error) {
        reject(error)
      } else {
        reject(utils.error("No content", 200))
      }
    }
  });
}

function crossTrackISRC (spotify_token, fromPlateform, query, isrc) {
  return new Promise(async (resolve, reject) => {
    var plateforms = new Object;
    var hasResults = false;
    var error = null;
    if(fromPlateform != 'deezer') {
      const deezerResult = await deezer.searchTrackISRC(query, isrc)
        .then(result => {
          plateforms.deezer = result;
          hasResults = true;
        })
        .catch(err => error = err);
    }

    if(fromPlateform != 'spotify') {
      if (spotify_token) {
        const spotifyResult = await spotify.searchTrackISRC(spotify_token, query, isrc)
          .then(result => {
            plateforms.spotify = result;
            hasResults = true;
          })
          .catch(err => error = err);
      } else {
        error = utils.error("No access_token for Spotify", 401);
      }
    }

    if(hasResults) {
      resolve(plateforms)
    } else {
      if (error) {
        reject(error)
      } else {
        reject(utils.error("No content", 200))
      }
    }
  });
}


function crossSearch (spotify_token, query) {
  return new Promise(async (resolve, reject) => {
    var plateforms = new Object;
    var hasResults = false;
    var error = null;

    const deezerResult = await deezer.getSearch(query)
      .then(result => {
        plateforms.deezer = result;
        hasResults = true;
      })
      .catch(err => error = err);

    if (spotify_token) {
      const spotifyResult = await spotify.getSearch(spotify_token, query)
        .then(result => {
          plateforms.spotify = result;
          hasResults = true;
        })
        .catch(err => error = err);
    }

    if(hasResults) {
      resolve(unifySearch(plateforms))
    } else {
      if (error) {
        reject(error)
      } else {
        reject(utils.error("No content", 200))
      }
    }
  });
}

function unifySearch(result) {
  var results = new Object;
  results.albums = [];
  results.tracks = [];
  if (Object.keys(result).length > 1) {
    Object.keys(result).forEach(plateform1 => {
      var matchedAlbums = [];
      var matchedTracks = [];
      let albums1 = result[plateform1].albums;
      let tracks1 = result[plateform1].tracks;

      Object.keys(result).filter(item => item != plateform1).forEach(plateform2 => {
        // Match albums
        let albums2 = result[plateform2].albums;
        if (albums1 && albums2) {
          var [albums, remains] = matchAlbums(albums1, albums2);
          Array.prototype.push.apply(matchedAlbums, albums);
          result[plateform2].albums = remains;
        }

        // Match tracks
        let tracks2 = result[plateform2].tracks;
        if (tracks1 && tracks2) {
          var [tracks, remains] = matchTracks(tracks1, tracks2);
          Array.prototype.push.apply(matchedTracks, tracks);
          result[plateform2].tracks = remains;
        }
      })

      if (matchedAlbums.length > 0) {
        Array.prototype.push.apply(results.albums, matchedAlbums);
        if (result[plateform1].albums) result[plateform1].albums = [];
      }
      if (matchedTracks.length > 0) {
        Array.prototype.push.apply(results.tracks, matchedTracks);
        if (result[plateform1].tracks) result[plateform1].tracks = [];
      }

    })
  }

  // Add the other elements
  Object.keys(result).forEach(plateform => {
    if(result[plateform].albums) {
      result[plateform].albums.forEach(item => {
        results.albums.push([item])
      });
    }
  });

  results.albums.sort((a,b) => sortResults(a,b))

  Object.keys(result).forEach(plateform => {
    if(result[plateform].tracks) {
      result[plateform].tracks.forEach(item => {
        results.tracks.push([item])
      });
    }
  });

  results.tracks.sort((a,b) => sortResults(a,b))

  return results;
}

function sortResults ( a, b ) {
  if ( a[0] == null ) return -1;
  if ( b[0] == null ) return 1;

  if ( a[0].updated_at > b[0].updated_at ) {
    return -1;
  }
  if ( a[0].updated_at < b[0].updated_at ) {
    return 1;
  }
  return 0;
}

function matchAlbums(albums1, albums2) {
  var albums = matched = [];
  albums1.forEach(i1 => {
    matched = [];
    matched.push(i1);
    for(let i = 0; i < albums2.length; i++) {
      let i2 = albums2[i];
      if (utils.isSameUPC(i1.upc, i2.upc)) {
        matched.push(i2);
        break;
      } else if (i1.name === i2.name && i1.updated_at === i2.updated_at) {
        matched.push(i2);
        break;
      } else if (utils.removeParentheses(i1.name) == utils.removeParentheses(i2.name) && i1.artists.length == i2.artists.length) { // same name, then check the artists
        matched.push(i2);
        break;

        /* To be checked if this is really usefull
        const length = i1.artists.length;
        var countMatch = 0;
        for (j = 0; j < length; j++) {
          let artist1 = i1.artists[j].name.toUpperCase()
          for (k = 0; k < length; k++) {
            let artist2 = i2.artists[k].name.toUpperCase()
            if(artist1 == artist2) countMatch++;
          }
        }
        if (countMatch == length) {
          matched.push(i2);
          break;
        }
        */
      }
    }
    albums.push(matched);
    albums2 = albums2.filter(i => !matched.map(m => m.upc).includes(i.upc));
  })

  return [ albums, albums2 ];
}

function matchTracks(tracks1, tracks2) {
  var tracks = matched = [];
  tracks1.forEach(i1 => {
    matched = [];
    matched.push(i1);
    for(let i = 0; i < tracks2.length; i++) {
      let i2 = tracks2[i];
      if (i1.isrc == i2.isrc) {
        matched.push(i2);
        break;
      }
    }
    tracks.push(matched);
    tracks2 = tracks2.filter(i => !matched.map(m => m.isrc).includes(i.isrc));

  })

  return [ tracks, tracks2 ];
}

async function deezerSeachStrategy(strategy, discogsItem) {
  const discogsArtistName = utils.removeParentheses(discogsItem.album.artists[0].name);
  const regexEP = new RegExp(' (EP|ep|Ep)$');
  const discogsAlbumName = discogsItem.album.name.replace(regexEP, '');

  const tracks = discogsItem.tracks.map(track => {
    return {
      artistName: track.artists[0] ? track.artists[0].name : discogsArtistName,
      trackName: track.name,
    };
  })

  var deezerResult;
  switch(strategy) {
    case 1:
      deezerResult = await deezer.getSearch(discogsArtistName + ' ' + discogsAlbumName, 'album');
      if (deezerResult && deezerResult.albums) {
        return deezerResult.albums;
      }
      break;
    case 2:
      deezerResult = await Promise.all(tracks.slice(0, 8).map(track => deezer.getSearch(track.artistName + ' ' + track.trackName, 'album')))
      if (deezerResult && deezerResult.length > 0) {
        deezerResult = deezerResult.flatMap(item => item.albums);
        return deezerResult;
      }
      break;
    case 3:
      deezerResult = await deezer.getSearch('artist:"' + discogsArtistName + '"', 'album');
      if(deezerResult && deezerResult.albums) {
        return deezerResult.albums;
      }
      break;
    case 4:
      deezerResult = await deezer.getSearch(discogsAlbumName, 'album');
      if (deezerResult && deezerResult.albums) {
        return deezerResult.albums;
      }
      break;
    case 5:
      deezerResult = await deezer.getSearch(discogsAlbumName);
      if (deezerResult && deezerResult.albums) {
        return deezerResult.albums;
      }
      break;
    case 6: // sarch from the tracks
      deezerResult = await Promise.all(tracks.map(track => deezer.getSearch(track.artistName + ' ' + track.trackName, 'track')))
      if (deezerResult && deezerResult.length > 0) {
        deezerResult = deezerResult.flatMap(item => item.tracks);
        deezerResult = await Promise.all(deezerResult.map(track => deezer.getAlbum(null, track.album.id, 'track')))
        if (deezerResult && deezerResult.length > 0) {
          return deezerResult;
        }
      }
      break;
    default:
      throw 'Undefined strategy for Deezer search';
      break;
  }

  return [];
}

async function spotifySeachStrategy(strategy, spotify_token, discogsItem) {
  const discogsArtistName = utils.removeParentheses(discogsItem.album.artists[0].name);
  const regexEP = new RegExp(' (EP|ep|Ep)$');
  const discogsAlbumName = discogsItem.album.name.replace(regexEP, '');
  const tracks = discogsItem.tracks.map(track => {
    return {
      artistName: track.artists[0] ? track.artists[0].name : discogsArtistName,
      trackName: track.name,
    };
  })
  var spotifyResult;
  switch(strategy) {
    case 1:
      spotifyResult = await spotify.getSearch(spotify_token, discogsArtistName + ' ' + discogsAlbumName, 'album');
      if (spotifyResult && spotifyResult.albums) {
        return spotifyResult.albums;
      }
      break;
    case 2:
      spotifyResult = await Promise.all(tracks.slice(0, 8).map(track => spotify.getSearch(spotify_token, track.artistName + ' ' + track.trackName, 'album')))
      if (spotifyResult && spotifyResult.length > 0) {
        spotifyResult = spotifyResult.flatMap(item => item.albums);
        return spotifyResult;
      }
      break;
    case 3:
      spotifyResult = await spotify.getSearch(spotify_token, 'artist:' + discogsArtistName + ' ', 'album');
      if(spotifyResult && spotifyResult.albums) {
        return spotifyResult.albums;
      }
      break;
    case 4:
      spotifyResult = await spotify.getSearch(spotify_token, discogsAlbumName, 'album');
      if (spotifyResult && spotifyResult.albums) {
        return spotifyResult.albums;
      }
      break;
    case 5:
      spotifyResult = await spotify.getSearch(spotify_token, discogsAlbumName);
      if (spotifyResult && spotifyResult.albums) {
        return spotifyResult.albums;
      }
      break;
    /*
    case 6: // sarch from the tracks
        spotifyResult = await Promise.all(tracks.map(track => spotify.getSearch(spotify_token, track.artistName + ' ' + track.trackName, 'track')))
        if (spotifyResult && spotifyResult.length > 0) {
          spotifyResult = spotifyResult.flatMap(item => item.tracks);
          spotifyResult = await Promise.all(spotifyResult.map(track => spotify.getAlbum(spotify_token, null, track.album.id, 'track')))
          if (spotifyResult && spotifyResult.length > 0) {
            return spotifyResult;
          }
        }
      break;*/
    default:
      throw 'Undefined strategy for Spotify search';
      break;
  }

  return [];
}

async function dispatchCompatibilityDiscogs(spotify_token, releases) {
  try {
    let searchCollection = await DiscogsCollection.find({ 'discogs.album.id': releases });

    fs.writeFileSync(filenameAlbumScore, "====== SCORE =====\n", 'utf-8')

    await utils.asyncForEach(searchCollection, async (item) => {

      const discogsItem = item.discogs;

      fs.appendFileSync(filenameAlbumScore, discogsItem.album.name + "\n");

      // Deezer bloc
      if (!item.deezer) {
        let strategy = 1, deezerResult;
        do {
          fs.appendFileSync(filenameAlbumScore, "  Deezer strategy: " + strategy + "\n");
          deezerResult = await deezerSeachStrategy(strategy, discogsItem);
          strategy++;
        } while(!await checkResults(discogsItem, 'deezer', deezerResult, compareAlbums) && strategy < 6)
      }

      // Spotify bloc
      if (!item.spotify) {
        let strategy = 1, spotifyResult;
        do {
          fs.appendFileSync(filenameAlbumScore, "  Spotify strategy: " + strategy + "\n");
          spotifyResult = await spotifySeachStrategy(strategy, spotify_token, discogsItem);
          strategy++;
        } while(!await checkResults(discogsItem, 'spotify', spotifyResult, compareAlbums) && strategy < 6)
      }
    })
  } catch (err) {
    console.error(err);
  }
  console.log('dispatchCompatibilityDiscogs done')
}

async function solveCompatibilityDiscogs(spotify_token, release) {
  const discogsItem = release.discogs;
  var strategy = 1, deezerResult;

  fs.writeFileSync(filenameTrackScore, "====== SCORE =====\n", 'utf-8')
  //fs.appendFileSync(filenameTrackScore, "  Deezer strategy: " + strategy + "\n");

  deezerResult = await deezerSeachStrategy(6, discogsItem);
  let res = await checkResults(discogsItem, 'deezer', deezerResult, compareAlbums)
  console.log(res);
}

async function checkResults(discogsItem, from, results, compareFunction) {
  let winner,
      weHaveAWinner = false,
      bestScore = 75;

  for (let i = 0; i < results.length; i++) {
    let toCompare = results[i];
    let score = compareFunction(discogsItem, toCompare, results.length);
    fs.appendFileSync(filenameAlbumScore, "    " + score + " ("+toCompare.name+")");
    fs.appendFileSync(filenameTrackScore, "    " + score + " ("+toCompare.name+")");


    if (score > bestScore) {
      fs.appendFileSync(filenameAlbumScore, " => new winner\n");
      fs.appendFileSync(filenameTrackScore, " => new winner\n");

      weHaveAWinner = true;
      bestScore = score;
      winner = toCompare;
    } else {
      fs.appendFileSync(filenameAlbumScore, "\n");
      fs.appendFileSync(filenameTrackScore, "\n");
    }
  }
  if (weHaveAWinner && winner) {
    await saveCollection(discogsItem.album.id, from, winner, bestScore);
  }
  return weHaveAWinner;
}

function compareAlbums(discogs, compare, nbAlbumsToCompare) {
  var score = 30/nbAlbumsToCompare;

  let filename = discogs.album.name.replace(new RegExp('[ /.]', 'g'), '') + '.txt'
  //fs.appendFileSync(__dirname+"/res/"+filename, "compare=\n")
  //fs.appendFileSync(__dirname+"/res/"+filename, util.inspect(compare) , 'utf-8')

  if (utils.isSameUPC(discogs.album.upc, compare.upc)) { // check the upc
    score+=100;
  }
  //fs.appendFileSync(__dirname+"/res/"+filename, "UPC = " + score +"\n" , 'utf-8')

  //console.log(compare)
  //console.log(discogs.album)

  if (discogs.album.name.toUpperCase() === compare.name.toUpperCase()) { // check the name of the album => 50%
    score+=40;
  } else {
    const regexEP = new RegExp(' (EP|ep|Ep)$');
    const regexNoneAlphaNum = /[^\p{L}0-9]/gu;
    const regexOneOrSeveralSpace = new RegExp(' +', 'g');

    const discogsWords = discogs.album.name
      .replace(regexEP, '')
      .replace(regexNoneAlphaNum, ' ')
      .toUpperCase()
      .trim()
      .split(regexOneOrSeveralSpace).
      filter(i => i && i.length > 0);
    const discogsNbWords = discogsWords.length;
    var discogsNbSameWords = 0;

    const compareWords = compare.name
      .replace(regexEP, '')
      .replace(regexNoneAlphaNum, ' ')
      .toUpperCase()
      .trim()
      .split(regexOneOrSeveralSpace)
      .filter(i => i && i.length > 0);;
    const compareNbWords = compareWords.length;
    var compareNbSameWords = 0;

    for (let i = 0; i < discogsWords.length; i++) {
      for (let j = 0; j < compareWords.length; j++) {
        let discogsWord = discogsWords[i];
        let compareWord = compareWords[j];
        if ( discogsWord === compareWord ) {
          compareNbSameWords+=1;
          discogsNbSameWords+=1;
          break;
        } else {
          if ( discogsWord.includes(compareWord) && compareWord.length/discogsWord.length > 0.2 ) {
            compareNbSameWords+=0.5;
            break;
          }
          if ( compareWord.includes(discogsWord) && discogsWord.length/compareWord.length > 0.2) {
            discogsNbSameWords+=0.5;
            break;
          }
        }
      }
    }

    const compareName = compare.name.toUpperCase();
    for (let  i= 0; i < discogs.tracks.length; i++) {
      let trackName = discogs.tracks[i].name.toUpperCase();
      if (trackName == compareName || trackName.includes(compareName) || compareName.includes(trackName)) {
        score+=10;
        break;
      }
    }
    if (discogsNbSameWords + compareNbSameWords == 0) {
      score-=40;
    } else {
      const deltaDiscogs = Math.abs(discogsNbWords - discogsNbSameWords);
      const deltaCompare = Math.abs(compareNbWords - compareNbSameWords);
      score+= (discogsNbWords-deltaDiscogs)/discogsNbWords * 20; // check the number of same word in the album name => 25%
      score+= (compareNbWords-deltaCompare)/compareNbWords * 25; // check the number of same word in the album name => 25%
    }
  }

  //fs.appendFileSync(__dirname+"/res/"+filename, "same name = " + score +"\n" , 'utf-8')

  if (discogs.album.release_date === compare.updated_at) {
    score+= 20;
  }
  else if (discogs.album.release_date && compare.updated_at) { // check the release date => 40%
    const maxMonth = 24;
    const diffMonth = Math.abs(moment(discogs.album.release_date).diff(moment(compare.updated_at), 'months'));
    if (diffMonth < maxMonth) {
      score+= (maxMonth-diffMonth)/maxMonth * 15;
    } else {
      // score -= 10;
    }
  }

  //fs.appendFileSync(__dirname+"/res/"+filename, "release date = " + score +"\n" , 'utf-8')

  if (discogs.album.nb_tracks && compare.nb_tracks) { // check the number of tracks => 30%
    const deltaDiscogs = Math.abs(discogs.album.nb_tracks - compare.nb_tracks); // diff
    const deltaCompare = Math.abs(compare.nb_tracks - discogs.album.nb_tracks); // diff
    score+= (discogs.album.nb_tracks-deltaDiscogs)/discogs.album.nb_tracks * 10;
    score+= (compare.nb_tracks-deltaCompare)/compare.nb_tracks * 10;
  }

  //fs.appendFileSync(__dirname+"/res/"+filename, "nb tracks = " + score +"\n" , 'utf-8')

  if (discogs.album.artists && discogs.album.artists.length > 0 && compare.artists && compare.artists.length > 0) {
    const discogsArtists = discogs.album.artists.map(a => utils.removeParentheses(a.name.toUpperCase()));
    const compareArtists = compare.artists.map(a => utils.removeParentheses(a.name.toUpperCase()));
    var discogsNbSameArtist = 0;
    var compareNbSameArtist = 0;

    for (let i = 0; i < discogsArtists.length; i++) {
      for (let j = 0; j < compareArtists.length; j++) {
        if ( discogsArtists[i].includes(compareArtists[j]) ) compareNbSameArtist++;
        if ( compareArtists[j].includes(discogsArtists[i]) ) discogsNbSameArtist++;
      }
    }

    if (discogsNbSameArtist + compareNbSameArtist === 0) {
      if ( compare.artists.map(a=>a.name) == 'Various Artists'
        || discogs.album.artists.map(a=>a.name) == 'Various Artists') {
        score+=20;
      } else {
        score-=30;
      }
    } else {
      const discogsDelta = Math.abs(discogsArtists.length - discogsNbSameArtist);
      const compareDelta = Math.abs(compareArtists.length - compareNbSameArtist);

      score+= (discogsArtists.length-discogsDelta)/discogsArtists.length * 20; // check the number of same word in the artist name => 20%
      score+= (compareArtists.length-compareDelta)/compareArtists.length * 15; // check the number of same word in the artist name => 20%
    }
  } else {
    score -= 30;
  }

  //fs.appendFileSync(__dirname+"/res/"+filename, "same artists (final score) = " + score +"\n" , 'utf-8')

  return score;
}

/*
function compareTracks(discogs, compare, nbTracksToCompare) {
  var score = 30/nbTracksToCompare;

  const regexNoneAlphaNum = /[^\p{L}0-9] /gu;
  const discogsTracks = discogs.tracks.map(track => {
    track.name = track.name.replace(regexNoneAlphaNum, '').trim().toUpperCase();
    return track;
  });

  const compareTracks = compare.tracks.map(track => {
    track.name = track.name.replace(regexNoneAlphaNum, '').trim().toUpperCase();
    return track;
  });

  console.log('compareTracks')
  console.log(compareTracks)

  var nbSameTracks = 0;
  for (let i = 0; i < discogsTracks.length; i++) {
    let discogsTrack = discogsTracks[i];

    console.log('discogsTrack')
    console.log(discogsTrack)

    let findSameTrack = compareTracks.find(item => {
      return diffTime(item.duration, discogsTrack.duration) < 10 &&
      (item.name === discogsTrack.name || item.name.includes(discogsTrack.name) || discogsTrack.name.includes(item.name))
    });

    console.log('findSameTrack');
    console.log(findSameTrack);

    if (findSameTrack) {
      nbSameTracks++;
    }
  }
  score+= nbSameTracks/discogsTracks.length * 80

  console.log(nbSameTracks + ' / ' + discogsTracks.length);
  console.log('score');
  console.log(score);

  return score;
}
*/

function diffTime(one, two) {
  return Math.abs(moment(one, 'mm:ss').diff(moment(two, 'mm:ss'),'seconds'));
}

function saveCollection(id, platformKey, item, score) {
  const query = { 'discogs.album.id' : id };
  const options = { new: true, upsert: true, useFindAndModify: false };
  const update = {
    [platformKey]: {
      validity_score: score,
      validity_percent: Number.parseFloat(Math.min(score, 100)).toFixed(2),
      album: {
        id: item.id,
        name: item.name,
        release_date: item.updated_at,
        link: item.link,
        upc: item.upc,
        nb_tracks: item.nb_tracks,
        artists: !item.artists ? [] : item.artists.map(artist => {
          return {
            id: artist.id,
            name: artist.name,
            link: artist.link,
          }
        })
      },
      tracks: !item.tracks ? [] : item.tracks.map(track => {
        return {
          id: track.id,
          name: track.name,
          isrc: track.isrc,
          duration: track.duration,
          link: track.link,
          artists: track.artists,
        }
      })
    }
  };
  return DiscogsCollection.findOneAndUpdate(query, { $set: update }, options);
}

exports.crossAlbumUPC = crossAlbumUPC;
exports.crossTrackISRC = crossTrackISRC;
exports.crossSearch = crossSearch;
exports.dispatchCompatibilityDiscogs = dispatchCompatibilityDiscogs;
exports.solveCompatibilityDiscogs = solveCompatibilityDiscogs;
