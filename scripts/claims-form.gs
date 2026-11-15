/**
 * One-time setup: creates the "Claim or update your listing" Google Form for
 * novapartyvenues.com and links it to a new Google Sheet.
 *
 * How to run:
 *   1. Go to https://script.google.com and click "New project".
 *   2. Delete the sample code, paste this whole file, click Save.
 *   3. Pick "createClaimForm" in the function menu and click Run.
 *   4. Approve the permission prompt (it's your own script; Google will warn
 *      "unverified app": click Advanced > Go to project).
 *
 * Result: a form and a sheet named "NoVA Party Venues - Listing claims" in your
 * Drive. The sheet gets a "Setup" tab with the links Claude needs.
 *
 * Question order matters: scripts/apply-claims.js and the sheet's Publish tab
 * read the response columns by position. Add new questions only at the end.
 */
function createClaimForm() {
  var NAME = 'NoVA Party Venues - Listing claims';
  var form = FormApp.create(NAME);
  form.setTitle('Claim or update your listing')
    .setDescription('NoVA Party Venues helps local parents compare party venues. Claiming your listing is free. ' +
      'Confirm or correct your details below and we will review and publish them, usually within 1 business day. ' +
      'Leave any detail blank to keep what is on the site now.')
    .setConfirmationMessage("Thanks! We'll review and publish your updates within 1 business day. Questions? hello@novapartyvenues.com")
    .setCollectEmail(false)
    .setAllowResponseEdits(false)
    .setShowLinkToRespondAgain(false)
    .setProgressBar(false);
  try { form.setRequireLogin(false); } catch (e) {}

  var num = function () { return FormApp.createTextValidation().requireNumber().setHelpText('Numbers only').build(); };

  // ---- Section 1: about you (private) ----  columns B-G
  form.addSectionHeaderItem().setTitle('About you').setHelpText('This stays private and is only used to verify your claim.');
  var idItem = form.addTextItem().setTitle('Listing ID').setHelpText('Filled in for you, please do not change.').setRequired(true);
  form.addTextItem().setTitle('Your name').setRequired(true);
  form.addMultipleChoiceItem().setTitle('Your role').setChoiceValues(['Owner', 'Manager', 'Marketing', 'Staff']).showOtherOption(true).setRequired(true);
  form.addTextItem().setTitle('Work email').setHelpText('Use your venue email address if you have one, it lets us approve your claim faster.')
    .setValidation(FormApp.createTextValidation().requireTextIsEmail().setHelpText('Enter a valid email address').build()).setRequired(true);
  form.addTextItem().setTitle('Best phone to reach you');
  form.addCheckboxItem().setTitle('Authorization').setChoiceValues(["I'm authorized to update this venue's listing"]).setRequired(true);

  // ---- Section 2: listing details (public) ----  columns H-R
  form.addSectionHeaderItem().setTitle('Listing details').setHelpText('This is what parents will see. Leave anything blank to keep the current listing.');
  form.addTextItem().setTitle('Party booking page URL').setHelpText('The page where parents can see or book party packages.');
  form.addTextItem().setTitle('Phone number for parents');
  form.addTextItem().setTitle('Address');
  form.addMultipleChoiceItem().setTitle('Setting').setChoiceValues(['Indoor', 'Outdoor', 'Indoor & outdoor']);
  form.addTextItem().setTitle('Ages').setHelpText('For example "3-12" or "All ages".');
  form.addTextItem().setTitle('Minimum guests').setValidation(num());
  form.addTextItem().setTitle('Maximum guests').setValidation(num());
  form.addTextItem().setTitle('Starting package price ($)').setHelpText('Your lowest total package price, not the per-child price.').setValidation(num());
  form.addParagraphTextItem().setTitle('Package details and pricing notes').setHelpText("What's included, party length, add-ons. Up to 300 characters.")
    .setValidation(FormApp.createParagraphTextValidation().requireTextLengthLessThanOrEqualTo(300).build());
  form.addMultipleChoiceItem().setTitle('Food').setChoiceValues(['Included in packages', 'Available as an add-on', 'Not provided (bring your own)']);
  form.addMultipleChoiceItem().setTitle('Outside food').setChoiceValues(['Allowed', 'Cake or cupcakes only', 'Not allowed']);
  form.addMultipleChoiceItem().setTitle('Interested in a featured listing?').setChoiceValues(['Yes, send me details', 'Maybe later', 'No thanks']);  // column S

  // ---- Linked sheet ----
  var ss = SpreadsheetApp.create(NAME);
  form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());
  SpreadsheetApp.flush();

  var prefill = form.createResponse().withItemResponse(idItem.createResponse('SLUG')).toPrefilledUrl().replace('SLUG', '{slug}');
  var setup = ss.getSheets().filter(function (s) { return s.getFormUrl() === null; })[0] || ss.insertSheet();
  setup.setName('Setup');
  setup.getRange(1, 1, 5, 2).setValues([
    ['Prefill link (for the site)', prefill],
    ['Form link', form.getPublishedUrl()],
    ['Form edit link', form.getEditUrl()],
    ['Sheet link', ss.getUrl()],
    ['Created', new Date()]
  ]);
  setup.autoResizeColumn(1);

  Logger.log('Done. Sheet: ' + ss.getUrl());
  Logger.log('Prefill link: ' + prefill);
}
