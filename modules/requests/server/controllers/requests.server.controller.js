'use strict';

/**
 * Module dependencies
 */
var path = require('path'),
  config = require(path.resolve('./config/config')),
  mongoose = require('mongoose'),
  Request = mongoose.model('Request'),
  errorHandler = require(path.resolve('./modules/core/server/controllers/errors.server.controller')),
  async = require('async'),
  traceLogCreate = require(path.resolve('./config/lib/tracelog')).create,
  scoreUpdate = require(path.resolve('./config/lib/score')).update;

var traceConfig = config.meanTorrentConfig.trace;
var appConfig = config.meanTorrentConfig.app;
var mtDebug = require(path.resolve('./config/lib/debug'));
var serverMessage = require(path.resolve('./config/lib/server-message'));
var serverNoticeConfig = config.meanTorrentConfig.serverNotice;
var scoreConfig = config.meanTorrentConfig.score;
var requestsConfig = config.meanTorrentConfig.requests;

/**
 * Create an request
 */
exports.create = function (req, res) {
  var user = req.user;
  var request = new Request(req.body);

  request.user = user._id;

  mtDebug.debugRed(request);

  if (user.score >= requestsConfig.scoreForAddRequest) {
    request.save(function (err) {
      if (err) {
        return res.status(422).send({
          message: errorHandler.getErrorMessage(err)
        });
      } else {
        res.json(request);

        scoreUpdate(req, user, scoreConfig.action.uploadTorrent, -requestsConfig.scoreForAddRequest);
      }
    });
  } else {
    return res.status(422).send({
      message: 'SERVER.SCORE_NOT_ENOUGH'
    });
  }
};

/**
 * Show the current request
 */
exports.read = function (req, res) {
  // convert mongoose document to JSON
  var request = req.request ? req.request.toJSON() : {};

  request.isCurrentUserOwner = !!(req.user && request.user && request.user._id.toString() === req.user._id.toString());

  res.json(request);
};

/**
 * Update an request
 */
exports.update = function (req, res) {
  var request = req.request;

  if (request.user._id === req.user._id || req.user.isOper) {
    request.title = req.body.title;
    request.desc = req.body.desc;
    request.rewards = req.body.rewards;
    request.type = req.body.type;

    request.save(function (err) {
      if (err) {
        return res.status(422).send({
          message: errorHandler.getErrorMessage(err)
        });
      } else {
        res.json(request);
      }
    });
  } else {
    return res.status(403).json({
      message: 'SERVER.USER_IS_NOT_AUTHORIZED'
    });
  }
};

/**
 * Delete an request
 */
exports.delete = function (req, res) {
  var request = req.request;

  if (request.user._id === req.user._id || req.user.isOper) {
    request.remove(function (err) {
      if (err) {
        return res.status(422).send({
          message: errorHandler.getErrorMessage(err)
        });
      } else {
        res.json(request);
      }
    });
  } else {
    return res.status(403).json({
      message: 'SERVER.USER_IS_NOT_AUTHORIZED'
    });
  }
};

/**
 * List of request
 */
exports.list = function (req, res) {
  var skip = 0;
  var limit = 0;
  var user_id = undefined;
  var res_id = undefined;

  if (req.query.skip !== undefined) {
    skip = parseInt(req.query.skip, 10);
  }
  if (req.query.limit !== undefined) {
    limit = parseInt(req.query.limit, 10);
  }
  if (req.query.user_id !== undefined) {
    user_id = req.query.user_id;
  }
  if (req.query.res_id !== undefined) {
    res_id = req.query.res_id;
  }

  var condition = {};
  if (user_id !== undefined) {
    condition.user = user_id;
  }
  if (res_id !== undefined) {
    condition.responses = {$in: [res_id]};
  }

  var countQuery = function (callback) {
    Request.count(condition, function (err, count) {
      if (err) {
        callback(err, null);
      } else {
        callback(null, count);
      }
    });
  };

  var findQuery = function (callback) {
    Request.find(condition)
      .sort('-createdAt')
      .populate('user', 'username displayName profileImageURL isVip')
      .skip(skip)
      .limit(limit)
      .exec(function (err, requests) {
        if (err) {
          return res.status(422).send({
            message: errorHandler.getErrorMessage(err)
          });
        } else {
          callback(null, requests);
        }
      });
  };

  async.parallel([countQuery, findQuery], function (err, results) {
    if (err) {
      return res.status(422).send(err);
    } else {
      res.json({rows: results[1], total: results[0]});
    }
  });

};

/**
 * Maker middleware
 */
exports.requestByID = function (req, res, next, id) {

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).send({
      message: 'SERVER.INVALID_OBJECTID'
    });
  }

  Request.findById(id)
    .populate('user', 'username displayName profileImageURL isVip')
    .populate({
      path: 'torrents',
      populate: {
        path: 'user',
        select: 'username displayName profileImageURL isVip'
      }
    })
    .exec(function (err, request) {
      if (err) {
        return next(err);
      } else if (!request) {
        return res.status(404).send({
          message: 'No request with that identifier has been found'
        });
      }
      req.request = request;
      next();
    });
};
