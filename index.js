'use strict';

var log = require('debug')('Console')
var lob = require('lob-enc');
var vm = require('vm')

// implements https://github.com/telehash/telehash.org/blob/v3/v3/channels/stream.md
exports.name = 'console';

exports.mesh = function(mesh, cbExt)
{
  var ext = {open:{}};

  /** attach a context for console channels 
   * @memberOf Mesh
   * @param {function} onStream - handler for incoming streams
   */
  mesh.console = function(context)
  {
    ext.context = Object.assign(context, { result : null});
  }
  // new incoming stream open request
  ext.open.console = function(args, open, cbOpen){
    var link = this;
    if(!ext.context)
      return cbOpen('no context');
    // pass any attached request packet as options, and a method to accept
    var channel = link.x.channel(open);
    if (open.json.cmd.split(";").length === 1){
      open.cmd = "result = " + open.json.cmd;
    }
    channel.script = new vm.Script(open.cmd)
    channel.context = vm.createContext(ext.context)

    channel.receiving = (err, packet, cbMore) => {
      log('receiving', err, packet)
      if(packet && packet.json.values){
        log('got exec', Object.keys(packet.json.values))
        channel.script.runInContext(channel.context)

        let response = packet.json.values.reduce((res, key) => {
          res[key] = channel.context[key]
          return res;
        }, { result : channel.context.result})

        channel.send({json : response})
      }
      cbMore();
    }

    channel.receive(open)
  }

  ext.link = function(link, cbLink)
  {
    link.console = (script, cb) => {
      var open = {json:{type:'console', cmd: script}};

      if (!cb){
        open.json.seq = 1; // always reliable
      }

      var channel = link.x.channel(open);

      channel.receiving = (err, packet, cbMore) => {
        if (err)
          cb(err)

        if (packet){
          console.log("receiving packet", packet.json)
          cb(null, packet.json)
          cbMore()
        }
      }

      channel.exec = (values) => new Promise((res, rej) => {
        channel.receiving = (err, packet, cbMore) => {
          if (err)
            return rej(err)
          if (packet)
            res(packet.json)

          cbMore()
        }
        channel.send({json : {values : values}})
      })
      channel.send(open);

      return channel;
    }

    cbLink();
  }

  cbExt(undefined, ext);
}
