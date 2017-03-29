/**
 * @NApiVersion 2.x
 * @NScriptType UserEventScript
 */

define(['N/crypto',
        'N/encode',
        'N/runtime',
        './nexSale_config'
        ],

function(crypto, encode, runtime, nexSale_config) {
    /**
    * This function gets the HMAC value of the string.
    *
    *  @param {string}
    *  			pasw - string
    */
    function doHash(pasw) {
    	var hashed = null;

    	var skey = crypto.createSecretKey({
    		encoding: encode.Encoding.UTF_8,
    		guid: nexSale_config.GUID
    	});

    	log.debug({
    		'title':'SKEY',
    		'details': skey
    	});

    	try {
    		var hmacSha512 = crypto.createHmac({
	    		algorithm: 'SHA512',
	    		key: skey
    		});
    		hmacSha512.update({
	    		input: pasw,
	    		inputEncoding: encode.Encoding.BASE_64
    		});

    		hashed = hmacSha512.digest({
    			outputEncoding: encode.Encoding.HEX
    		});
    	} catch (e) {
    		log.error({
	    		title: 'doHash - Failed to hash input',
	    		details: 'key: '+skey+' '+e
    		});
    	}
    	return hashed;
	}


    function beforeSubmit(scriptContext) {

    	if( scriptContext.type != 'DELETE') {

        	var passw = scriptContext.newRecord.getValue({
        		fieldId: 'password'
        	});

        	if(passw) {
            	log.debug({
            		'title':'PASS',
            		'details': passw,
            	});


            	//Getting the hash of the given string
            	var hashed = doHash(passw);

            	log.debug({
            		title: 'HASHED',
            		details: hashed
            	});

            	//Sets the hash password  on the field
            	scriptContext.newRecord.setValue({
            		fieldId: nexSale_config.field.ALT_PASSWORD,
            		value: hashed
            	});
        	}
    	}
    }

    return {
       // beforeLoad: beforeLoad,
        beforeSubmit: beforeSubmit,
       // afterSubmit: afterSubmit
    };

});
