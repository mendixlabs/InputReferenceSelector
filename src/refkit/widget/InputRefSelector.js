dojo.provide("refkit.widget.InputRefSelector");
if (typeof jQuery == 'undefined') { 
    dojo.require("refkit.lib.jquery");
}
dojo.require("refkit.lib.XPathSource");
dojo.require("dijit.form.ComboBox");


mendix.widget.declare("refkit.widget.InputRefSelector", {
    addons    : [ dijit._Templated ],
    inputargs : {
        objreference : "",
        objattribute : "",
        constraints  : "",
        suggestions  : 5,
        fetchmethod  : "contains", // you want to have default for this
        autocomplete : true,
        onchangemf   : "",
        notfoundmf   : "",
        searchdelay  : 300,
        searchempty  : true,
        sortattrs    : "",
        sortorder    : ""
    },
    baseClass      : "refkitInputRefSelector",
    templateString : '<div class="${baseClass} mendixFormView_textBox"></div>',
    
    sourceObject   : null,
    referredEntity : "",
    currentValue   : "",
    currentConstr  : "",
    
    sortParams     : null,
    xpathSource    : null,
    comboBox       : null,
    
    ignoreChange   : false,
    isInactive     : false,
    
    
    postCreate : function() {
		console.log('postc');
        logger.debug(this.id + ".postCreate");
        
        this.sortParams = [];

        mendix.lang.runBindActions(this, [
            "actParseConfig",
            "actSetupSource",
            "actSetupInput"
        ]);
        
        this.loaded();
    },
    
    applyContext : function(context, callback) {
		console.log('apply');

        logger.debug(this.id + ".applyContext");
        
        var trackId = context && context.getTrackID();
        
        if (trackId) {
            
            var cs     = this.constraints,
                constr = this.currentConstr = cs ? this.matchTokens(cs, context.getTrackID()) : "";
            
            if (constr != cs) {
                // update constraints
                this.xpathSource.updateConstraints(constr);
            }

            mx.processor.get({
                guid     : trackId,
                callback : dojo.hitch(this, "setSourceObject")
            });
        } else {
            this.setSourceObject(null);    
        }
        
        callback && callback();
    },
    
    actParseConfig : function(callback) {
		console.log('parse');
        logger.debug(this.id + ".parseConfig");
        
        var splits    = this.objreference.split("/"),
            sortAttrs = this.sortattrs.split(";"),
            sortOrder = this.sortorder.split(";");

        this.name           = splits[0];
        this.objreference   = splits[0];
        this.referredEntity = splits[1];

        for (var i = 0, attr; attr = sortAttrs[i]; i++) {
            this.sortParams.push([attr, sortOrder[i]]);
        }

        callback && callback();
    },
    
    actSetupSource : function(callback) {
		console.log('acts');

        logger.debug(this.id + ".actSetupSource");

        this.xpathSource = new refkit.lib.XPathSource({
            limit       : this.suggestions,
            entity      : this.referredEntity,
            attribute   : this.objattribute,
            constraints : this.constraints,
            fetchmethod : this.fetchmethod,
            searchempty : this.searchempty,
            sortorder   : this.sortParams
        });
        
        callback && callback();
    },
    
    actSetupInput : function(callback) {
		console.log('input');

        logger.debug(this.id + ".actSetupInput");
        
		if (!this.comboBox) {
			this.comboBox = new dijit.form.ComboBox({
				store        : this.xpathSource,
				queryExpr    : "${0}",
				searchAttr   : this.objattribute,
				searchDelay  : this.searchdelay,
				tabIndex     : 0,
				hasDownArrow : false,
				autoComplete : this.autocomplete
			});
		}
		console.log('combobox created');
        
        this.domNode.appendChild(this.comboBox.domNode);
		dojo.connect(this.comboBox, "onChange", dojo.hitch(this, "valueChange"));
        this.comboBox.domNode.removeAttribute("tabIndex");

        callback && callback();
    },
    
    setSourceObject : function(obj) {
		console.log('sets');
        logger.debug(this.id + ".setSourceObject");
        
        this.sourceObject = obj;
        this.removeSubscriptions();
        
        if(obj) {
            this.isInactive || this.comboBox.attr("disabled", false);
            
            var guid = obj.getGUID();

            this.subscribeToGuid(guid);
            this.subscribeToChange(guid, this.objreference, dojo.hitch(this, "changeReceived"));
            
            this.getReferredObject(obj.getAttribute(this.objreference));
        } else {
            this.comboBox.attr("disabled", true);    
        }
    },

    objectUpdateNotification : function() {
		console.log('up');
	
        logger.debug(this.id + ".objectUpdateNotification");

        this.getReferredObject(this.sourceObject.getAttribute(this.objreference));
    },
    
    changeReceived : function(guid, attr, value) {
        console.log(this.id + ".changeReceived, change: ",arguments);
        if (!this.ignoreChange) {
            this.getReferredObject(value);
        }
    },
    
    getReferredObject : function(guid) {
        console.log(this.id + ".getReferredObject");
        
        this.currentValue = guid;
        
        if(guid) {
            mx.processor.get({
                guid     : guid,
                callback : dojo.hitch(this, function(obj) {
                    if (obj.isEnum(this.objattribute)){
                        this.setDisplayValue(obj.getEnumCaption(this.objattribute));
                    } else {
                        this.setDisplayValue(obj.get(this.objattribute));
                    }
                    
                })
            });
        } else {
            this.setDisplayValue("");
        }
    },
    
    setDisplayValue : function(value) {
		console.log('dv');
        this.ignoreChange = true;
		
		if (this.comboBox) {
			this.comboBox.attr("value", value);
        } 
        
        var self = this;

        $('div#' + this.id).focusin(function() {
           $(this).addClass('MxClient_Focus');
           $(this).css('outline', '#333 auto 2px'); 
           if ($('div#' + self.id + ' div').hasClass('dijitTextBoxFocused')) {
                $('div#' + self.id + ' div').css('outline', 'rgb(0, 0, 0) auto 0px');
           }
        });

        $('div#' + this.id).focusout(function() {
           $(this).removeClass('MxClient_Focus'); 
           $(this).css('outline', 'transparent auto 0px');
        });

        setTimeout(function() { self.ignoreChange = false; }, 10);
    },
    
    valueChange : function(value, target) {
        console.log(this.id + ".valueChange, new value:"+value);
        
        if (!this.ignoreChange) {
            this.ignoreChange = true;
            this.getGuid(dojo.hitch(this, function(guid) {
                if (guid == "" && this.notfoundmf != "") {
                    mx.processor.createObject({
                        className: this.referredEntity,
                        callback : dojo.hitch(this, function (obj) {
                            obj.setAttribute(this.objattribute, value);
                            obj.save({ callback : function () {}});
                            this.sourceObject.addReference(this.objreference, obj.getGUID());
                            this.sourceObject.save({
                                callback : dojo.hitch(this, function () {
                                    this.ignoreChange = false;
                                    this.executeMF(this.notfoundmf);
                                })
                            });
                        }),
                        error    : function () {
                            // Error
                        },
                        context  : null
                    });
                } else if (guid != this.currentValue) {
                    this.sourceObject.setAttribute(this.objreference, this.currentValue = guid);
                    this.ignoreChange = false;
                    this.executeMF(this.onchangemf);
                }
            }));
        }
    },

    
    executeMF : function (mf) {
		console.log('mf');
        if (mf) {
            var context = mx.ui.newContext();
            
            if (this.sourceObject) {
                context.setContext(this.sourceObject.getClass(), this.sourceObject.getGUID());
            }
            
            mx.xas.action({
                actionname : mf,
                context    : context,
                callback   : function() {
                    // ok
                },
                error      : function() {
                    // error
                }
            });
            
            mx.ui.destroyContext(context);
        }
    },
    
    // TODO: Recheck in 3.0
    matchTokens : function(str, mendixguid){
		console.log('match');
        var newstr = (
            (str!=null && str!="") 
                ? ( (str.match(/\[%CurrentObject%\]/)!=null) 
                    ? str.replace(/\[%CurrentObject%\]/g,mendixguid)
                    : str) 
                : "");
        return newstr;
    },
    
    // TODO: use xpath from source
    getGuid : function(callback) {
        console.log(this.id + ".getObject");
        
        var value = this.comboBox.attr("value"),
            item  = this.comboBox.item;
        
        if (item) { // we already have an object
            callback(item.getGUID());
        } else if (value != "") { // find an object that meets our requirements
            var attr   = this.objattribute,
                method = this.fetchmethod == "startswith" ? "starts-with" : this.fetchmethod,
                constr = "[" + method + "(" + attr + ",'" + value + "')";

            constr += method == "starts-with" ? " or " + attr + "='" + value + "']" : "]";
            
            var xpath = "//" + this.referredEntity + this.currentConstr + constr;

            mx.processor.get({
                xpath  : xpath,
                filter : {
                    limit : 2 // then we know if there is more than one object meeting the constraint
                },
                callback : function(objs) {
                    if (objs.length == 1) {
                        callback(objs[0].getGUID());
                    } else {
                        logger.warn(this.id + ".onBlur: There is more than one object found, so change is ignored");
                        
                        this.setDisplayValue("");
                        callback("");
                    }
                }, 
                error : function() {
                    // error
                }
            }, this);
        } else {
            callback("");
        }
    },
    
    _setDisabledAttr : function(value) {
        console.log(this.id + "._setDisabledAttr");

        this.isInactive = !!value;
        this.comboBox.attr("disabled", this.isInactive);
    },
    
    uninitialize : function() {
        logger.debug(this.id + ".uninitialize");
        
        this.comboBox.destroyRecursive();
    }
});
