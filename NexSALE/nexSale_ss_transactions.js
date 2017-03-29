/**
 * @NApiVersion 2.x
 * @NScriptType ScheduledScript
 *
 */
 define([
   'N/record',
   'N/search',
   'N/https',
   'N/runtime',
   './nexPos_integration_lib.js', './nexSale_config.js', './nexSale_transaction_ue.js'
 ], function(record, search, https, runtime, lib, nexSale_config, ue) {

 function getDomain(mode) {
   return '.algolia.net';
 }

  /**
   * Definition of the Scheduled script trigger point.
   *
   * @param {Object} scriptContext
   * @param {string} scriptContext.type - The context in which the script is executed. It is one of the values from the scriptContext.InvocationType enum.
   * @Since 2015.2
   */
  function execute(scriptContext) {
    try {
      var items = JSON.parse(runtime.getCurrentScript().getParameter('custscript_items'));
      log.debug('Items: '+JSON.stringify(items));
      ue.processPerLine(items);
  	} catch (e) {
  		log.debug({title: 'FATAL ERROR', details: 'Fatal error occurred in script: '+
        runtime.getCurrentScript().id +'\n\n' + JSON.stringify(e) });
  	}

    //ue.processPerLine
  }

  return {
      execute: execute
  };

});
