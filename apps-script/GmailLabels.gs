/**
 * ============================================================
 *  GmailLabels.gs — Gmail label helpers for Autosmartweby CRM
 * ============================================================
 *  Load order : 5/7
 *  Depends on : Config.gs, Helpers.gs (aswLog_, safeAlert_)
 *
 *  Provides functions to create, assign, remove, and check
 *  Gmail labels used by the CRM pipeline.
 * ============================================================
 */

/* ------------------------------------------------------------------ */
/*  Label constants                                                    */
/* ------------------------------------------------------------------ */

var CRM_LABEL_ROOT = 'ASW/CRM';

// Future sub-labels — uncomment when needed
// var CRM_LABEL_LINKED  = CRM_LABEL_ROOT + '/Linked';
// var CRM_LABEL_REPLIED = CRM_LABEL_ROOT + '/Replied';
// var CRM_LABEL_REVIEW  = CRM_LABEL_ROOT + '/Review';

/* ------------------------------------------------------------------ */
/*  PUBLIC — ensureCrmLabels()                                         */
/*  Callable from the custom menu. Creates root CRM label if missing.  */
/*  Idempotent — safe to run repeatedly.                               */
/* ------------------------------------------------------------------ */

function ensureCrmLabels() {
  try {
    var label = getOrCreateGmailLabel_(CRM_LABEL_ROOT);
    aswLog_('INFO', 'ensureCrmLabels', 'Root label ready: ' + label.getName());
    safeAlert_('CRM Gmail labely jsou připraveny.');
  } catch (e) {
    aswLog_('ERROR', 'ensureCrmLabels', 'Failed to ensure labels: ' + e.message);
    safeAlert_('Chyba při vytváření CRM labelů: ' + e.message);
  }
}

/* ------------------------------------------------------------------ */
/*  PRIVATE — getOrCreateGmailLabel_(labelName)                        */
/*  Returns existing label or creates a new one. Never returns null.   */
/* ------------------------------------------------------------------ */

function getOrCreateGmailLabel_(labelName) {
  var label = GmailApp.getUserLabelByName(labelName);
  if (label) {
    return label;
  }
  label = GmailApp.createLabel(labelName);
  aswLog_('INFO', 'getOrCreateGmailLabel_', 'Created new Gmail label: ' + labelName);
  return label;
}

/* ------------------------------------------------------------------ */
/*  PRIVATE — labelThread_(thread, labelName)                          */
/*  Adds a label to the given GmailThread. Idempotent.                 */
/*  Returns true on success, false on error.                           */
/* ------------------------------------------------------------------ */

function labelThread_(thread, labelName) {
  try {
    var label = getOrCreateGmailLabel_(labelName);
    thread.addLabel(label);
    return true;
  } catch (e) {
    aswLog_('ERROR', 'labelThread_', 'Failed to label thread: ' + e.message);
    return false;
  }
}

/* ------------------------------------------------------------------ */
/*  PRIVATE — unlabelThread_(thread, labelName)                        */
/*  Removes a label from the thread. Safe if label/thread mismatch.    */
/*  Returns true on success, false on error.                           */
/* ------------------------------------------------------------------ */

function unlabelThread_(thread, labelName) {
  try {
    var label = GmailApp.getUserLabelByName(labelName);
    if (!label) {
      return true; // label doesn't exist — nothing to remove
    }
    thread.removeLabel(label);
    return true;
  } catch (e) {
    aswLog_('ERROR', 'unlabelThread_', 'Failed to unlabel thread: ' + e.message);
    return false;
  }
}

/* ------------------------------------------------------------------ */
/*  PRIVATE — threadHasLabel_(thread, labelName)                       */
/*  Returns true if the thread currently carries the named label.      */
/* ------------------------------------------------------------------ */

function threadHasLabel_(thread, labelName) {
  try {
    var labels = thread.getLabels();
    for (var i = 0; i < labels.length; i++) {
      if (labels[i].getName() === labelName) {
        return true;
      }
    }
    return false;
  } catch (e) {
    aswLog_('ERROR', 'threadHasLabel_', 'Failed to check labels: ' + e.message);
    return false;
  }
}
