const utils = require('../../utils');
const User = require('mongoose').model('User');

function me(req) {
  return new Promise((resolve, reject) => {
    resolve({'email': req.user.email})
  })
}

function accounts(req) {

}

exports.me = me;
exports.accounts = accounts;