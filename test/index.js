var assert = require('chai').assert;
var request = require('supertest');
var app = require('../app');

describe('GET /', function() {
  it('should load without errors', function(done) {
    request(app)
      .get('/')
      .expect(200)
      .end(function(err, res) {
        if (err) {
          return done(err);
        }
        assert.include(res.text, 'Created');
        done();
      });
  });
});
