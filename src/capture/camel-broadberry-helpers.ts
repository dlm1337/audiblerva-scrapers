import { doScreenshot } from '../core/screenshots';
declare const injectedHelpers : any, document: any;

import {puppeteer, puppeteerUtils, models, captureHelpers, parsers, domUtils } from '../barrel';
import { CapturePerformer } from '../core/models';
import { runInNewContext } from 'vm';

export const outputLog = (log: models.CaptureLog) => {    
    console.log(`Capture Log: tenant: ${log.tenantName}, channelName: ${log.channelName}, date: ${log.logDt}...`);
    console.log(`totalCapturedEvents: ${log.totalCapturedEvents}, error logs: ${log.errorLogs.length}`);
    log.errorLogs.forEach(x => console.log(`\tError: ${x}`));
}

export const removeNoDateEvents = (results: models.CaptureResults, log: models.CaptureLog) => {
    results.events = results.events.filter(val => {
     
        if (!val.startDt) {
            let eventUri = '';
            if (val && val.eventUris && val.eventUris.length)
                eventUri = val.eventUris[0].uri;
            log.errorLogs.push(`Removing event because no date could be found: ${val.eventTitle}, ${eventUri}`);
            return false;
        }
        return true;
    });
}

export const parseMCamelOrBroadberryPgBrwserFn = (daysCtx, results, log, deps): [models.CaptureLog, models.CaptureResults] => {  
  try {    
    //get each day w >= 1 event
    
    var x = 0;
    for (let dayItem of daysCtx||[]) {      
      //get each event
      let eventsCtx = dayItem.querySelectorAll(deps.eventSelector);
      for (let eventItem of eventsCtx||[]) {
        let event = <models.CaptureEvent> {
          tenantName: deps.channelCfg.TENANT_NAME,
          channelName: deps.channelCfg.CHANNEL_NAME,
          channelImage: deps.channelCfg.CHANNEL_IMAGE,
          channelBaseUri: deps.channelCfg.PRIMARY_URI,
          venueName: deps.channelCfg.VENUE_NAME,
          performers: [] as models.CapturePerformer[],
          eventImageUris: [] as string[],
          eventUris: [] as models.UriType[],
          miscDetail: [] as string[],
          unparsedDetail: [] as string[],
          ticketCost: [] as models.TicketAmtInfo[],
          venueAddressLines: deps.channelCfg.VENUE_ADDRESS ? deps.channelCfg.VENUE_ADDRESS : [],
          venueContactInfo: deps.channelCfg.VENUE_PHONENUM ? [ { item: deps.channelCfg.VENUE_PHONENUM, itemType: deps.CONTACT_ITEM_TYPES.PHONE }] : [],
          eventContactInfo: [] as models.ContactInfoItem[],
          minAge: null,
          rawDoorTimeStr: null,
          doorTimeHours: null,
          doorTimeMin: null,
          promoters: [] as models.PromoterInfo[],
          neighborhood: deps.neighborhood       
        };
        
        //get headliners
        let titleSegments = [];
        let headlinersLinkCtx = eventItem.querySelectorAll(".rhp-event-thumb");
        for (let headlinerLinkItem of headlinersLinkCtx||[]) {
         // let isPrimary = headlinerLinkItem.classList.contains('summary');
          let linkElement = headlinerLinkItem.querySelector('a:first-child');
          let eventUri :models.UriType = { uri: linkElement.getAttribute("href").trim(), isCaptureSrc: true};
         // if (eventUri.uri) {
           // eventUri.uri = deps.channelCfg.DOMAIN_NAME + eventUri.uri;
         // }
          let performerName = linkElement.getAttribute("title").trim()
          let testExist = (el:models.CapturePerformer)=> el.performerName==performerName;
          
          if (event.eventUris.map(x => x.uri).indexOf(eventUri.uri) === -1) {
            event.eventUris.push(eventUri);
          }              
          if (titleSegments.findIndex(testExist) === -1) {
            titleSegments.push(performerName);
           // console.log(performerName);
          }
        }

        // test if at broadberry
        // let venueElem = eventItem.querySelector('h2.venue.location');
        // if (venueElem) {
        //       if (venueElem.innerText.match(/broadberry/i)) { 
        //         event.venueName = deps.channelCfg.VENUE_NAME;
        //       }
        // }

        //get supporting acts
        // let supporterLinkCtx = eventItem.querySelectorAll("h2.supports a");
        // for (let supporterLinkItem of supporterLinkCtx||[]) {
        //   let eventUri :models.UriType = { uri: supporterLinkItem.getAttribute("href").trim(), isCaptureSrc: true};
        //   if (eventUri.uri) {
        //     eventUri.uri = deps.channelCfg.DOMAIN_NAME + eventUri.uri;
        //   }

        //   let performerName = supporterLinkItem.innerText.trim();
        //   let testExist = (el:models.CapturePerformer)=> el.performerName==performerName;

        //   if (event.eventUris.map(x => x.uri).indexOf(eventUri.uri) === -1) {
        //     event.eventUris.push(eventUri);
        //   }
        //   if (titleSegments.findIndex(testExist) === -1) {
        //     titleSegments.push(performerName);
        //   }
        // }

        event.eventTitle = titleSegments.join(" / ");

        //ticket link
        let ticketsLink = eventItem.querySelector(".rhp-event-cta");
        let ticketsA = ticketsLink.querySelector('a:first-child');
        if (ticketsA) {
          event.ticketUri = ticketsA.getAttribute("href").trim();
          if (event.eventUris.map(x => x.uri).indexOf(event.ticketUri) === -1) {
            event.eventUris.push({ uri: event.ticketUri, isCaptureSrc: false});
          }
        } 
        try{
          let ticketCost = eventItem.querySelector(".eventCost");  
          let ticketCostSpan = ticketCost.querySelector("span");
          let ticketCostText = ticketCostSpan.innerText.trim();
          event.ticketCostRaw = ticketCostText;
          ticketCostText = ticketCostText.replace("$", "");
          let ticketCostNum = parseInt(ticketCostText);
          event.ticketCost.push(<models.TicketAmtInfo> { amt: ticketCostNum, qualifier: "" });
        }catch(e) {
        log.errorLogs.push(`No Ticket Cost: ${e.message}`);
        event.ticketCostRaw = "Free";
        event.ticketCost.push(<models.TicketAmtInfo> { amt: 0, qualifier: "" });
        } 
        //free events adv on the calendar, more ticket info is on the detail page
        
        // if (eventItem.querySelector('h2.age-restriction.all-ages')) {
        //   event.minAge = 0;
        // } else if (eventItem.querySelector('h2.age-restriction.over-21')) {
        //   event.minAge = 21;
        // }

        results.events.push(event);
      } //event loop
    } //day loop
  }
  catch(e) {
    log.errorLogs.push(`Capture Main Page Exception Thrown: ${e.message}`);
  }

  return [log, results];
}

export const parseCamelOrBroadberry = async(page: puppeteer.Page, curEvent:models.CaptureEvent, log: models.CaptureLog, deps: any) : Promise<[models.CaptureLog, models.CaptureEvent]> => {    
    try {
    //browse to the cur event's detail page
    await puppeteerUtils.goto(page, deps.curUri, deps.navSettings);

    //add helpers from parsers module into page
    await puppeteerUtils.injectHelpers(page, [parsers, domUtils], 'injectedHelpers');

    const RICHMONDSHOWS_CONTENT_SELECTOR : string = "*";
    
    //scrape from container element
    [log, curEvent ] = 
          await page.$$eval<[models.CaptureLog, models.CaptureEvent], models.CaptureEvent, models.CaptureLog, any>(
            RICHMONDSHOWS_CONTENT_SELECTOR, 
            parseCamelOrBroadberryDetPageBrwserFn, 
            curEvent,
            log,
            deps);
    } catch (e) {
        log.errorLogs.push(`Error navigating to detail page: ${deps.curUri} : ${e.message} .`);
    } finally {
        return [log, curEvent ];
    }
  
}

let parseCamelOrBroadberryDetPageBrwserFn = (detailCtx, curEvent: models.CaptureEvent, log: models.CaptureLog, deps : any): [models.CaptureLog, models.CaptureEvent] => {  
  

  let daysInMonth = (month, year) => {
    return new Date(year, month, 0).getDate();
  } 

  try
  {    
    curEvent.detailPageInnerText = document.body.innerText;
    curEvent.detailPageHtml = document.body.innerHTML;
    
    if (!detailCtx || detailCtx.length < 1) {
      log.errorLogs.push(`Could not find Detail Container Element for page: ${deps.curUri}`);
    }
    else if (detailCtx.length > 0) {
      //start with the ld+json
      let ldSuccess = false, ldEvent:any;
      let ld = [...document.querySelectorAll('script[type="application/ld+json"]')].map(x => JSON.parse(x.innerText)).map(x => Array.isArray(x) ? x[0] : x);
      if (ld && ld.length > 0 ) {
        let ldEventArray = ld.filter(x => x['@type'] == 'Event');
        if (ldEventArray && ldEventArray.length > 0) {
          ldEvent = ldEventArray[0];
          ldSuccess = true;
        } 
      }
      if (!ldSuccess) {
        throw new Error(`Could not extract json+ld event data (@Type=='Event')`);
      } 

      if (ldEvent.startDate) {
        let date = new Date();
        let dateDayInMonth = date.getDate();
        let month = date.getMonth() + 1; 
        let year = date.getFullYear(); 
        let monthLen = daysInMonth(month, year); 
        let eventDate = new Date(ldEvent.startDate);
        let eventDayOfMonth = eventDate.getDate() - 1;
        let y = 0;
        for(let x = 0; x < 8; x++)
        {
          if(dateDayInMonth < monthLen){
             dateDayInMonth += 1;
             y++;
          } else{
             dateDayInMonth = 1;
             y++;
             month += 1;
          }

          if(y == 7 && eventDayOfMonth <= dateDayInMonth && (eventDate.getMonth() + 1) == month ){
            curEvent.startDt = new Date(ldEvent.startDate).toISOString(); 
            console.log("event was within 7 days.");
          } else if(y == 7){
            curEvent.startDt = null;
            console.log("event was not within 7 days of scrape.");
          }
        }
        
      } else {
        throw new Error(`Could not extract startDt from json+ld event data (@Type=='Event')`);
      }

      if (ldEvent.endDate) {
        curEvent.endDt = new Date(ldEvent.endDate).toISOString();
      } else {
        log.warningLogs.push(`No endDt from json+ld for page: ${deps.curUri}`);
      }

      if (ldEvent.image) {        
        curEvent.eventImageUris.push(ldEvent.image);            
      } else {
        log.warningLogs.push(`No main image found from json+ld for page: ${deps.curUri}`);
      }

      // if (ldEvent.ageRange && ldEvent.typicalAgeRange === "all_ages") {
      //   curEvent.minAge = 0;
      // }

      if (ldEvent.offers && ldEvent.offers.url && !curEvent.ticketUri) {
        curEvent.ticketUri = ldEvent.offers.url;
      }

      if (ldEvent.location && ldEvent.location.name && !curEvent.venueName) {
        curEvent.venueName = ldEvent.location.name;
      }

      if ((!curEvent.venueAddressLines || curEvent.venueAddressLines.length === 0) && ldEvent.location && ldEvent.location["@type"]=== 'Place') {
        curEvent.venueAddressLines.push(ldEvent.location.address as string, ldEvent.location.name as string);
      }
      
      // if (ldEvent.doorTime) {
      //   let doorTime = new Date(ldEvent.doorTime);
      //   curEvent.doorTimeHours = doorTime.getHours();
      //   curEvent.doorTimeMin = doorTime.getMilliseconds();
      // }
      
      let curCtx = detailCtx[0];

      //promoter, if exists
      // let promoterElem = curCtx.querySelector('h2.topline-info');
      // if (promoterElem) {
      //   curEvent.promoters.push({ name: promoterElem.innerText, desc: '', uris: []})
      // }

      //venue address/info, if exists and not already set
      let venueElem = curCtx.querySelector('meta[name="twitter:description"]');
      let venueElemAttr = venueElem.getAttribute('content');
      if (venueElemAttr) {
        curEvent.venueAddressLines.push(venueElemAttr as string);
      }

      //start date and time
      let startDtElem = curCtx.querySelector('.eventStDate');
      if (startDtElem && !curEvent.startDt) {
        let actualStartDt = new Date(startDtElem.innerText.trim());
        if (startDtElem) {
          curEvent.startDt = actualStartDt.toISOString();
        } else {
          log.errorLogs.push(`Could not find start date from .eventStDate on page: ${deps.curUri}`);
        }
      }

      //per the policy stated here https://www.thecamel.org/faq/
      //unless otherwise noted, sun-thurs is all ages, fri-sat are 18+
      // if (curEvent.minAge === null && actualStartDt.getDay() <= 4) {
      //   curEvent.minAge = 0;
      // } else if (curEvent.minAge === null && actualStartDt.getDay() > 4) {
      //   curEvent.minAge = 18;
      // }
      
      //get main image (first from ld)
      // let imgItem = curCtx.querySelector("img:first-child");
      // if (imgItem)
      // {
      //   let imageUri = imgItem.getAttribute("src").trim();  
      //   if (curEvent.eventImageUris.indexOf(imageUri) === -1) {
      //     curEvent.eventImageUris.push(imageUri);
      //   }    
      // } else {
      //   log.warningLogs.push(`Expecting first child of div.event-detail to be an image for page: ${deps.curUri}`);
      // }

      //name of main performer
      let mainPerformer :string = '';
      let mainPermElem = curCtx.querySelector('meta[property="og:title"]');
      let mainPermElemText = mainPermElem.getAttribute('content');
      if (mainPermElemText) {
        mainPerformer = mainPermElemText.trim();
      } else {
        log.warningLogs.push(`Expecting to find a main performer (meta[property="og:title"]) for page: ${deps.curUri}`);
      }

      //get doors
      let doorElem = curCtx.querySelector('.eventDoorStartDate');
      let doorElemSpan = doorElem.querySelector('span');
      if (doorElemSpan) {
        let doorElemSpanTxt = doorElemSpan.innerText.trim();
        [curEvent.rawDoorTimeStr, curEvent.doorTimeHours, curEvent.doorTimeMin ] = injectedHelpers.parseTime(doorElemSpanTxt);
      } else {
        log.infoLogs.push(`No door info found in .eventDoorStartDate 1st child span for page: ${deps.curUri}`);
      }

      if (!curEvent.ticketCostRaw) {
        let tixPriceElem = curCtx.querySelector('.eventCost');
        let tixPriceElemSpan = tixPriceElem.querySelector('span');
        if (tixPriceElemSpan) {
          let rawTixPriceTxt = tixPriceElemSpan.innerText.trim();
          curEvent.ticketCostRaw = rawTixPriceTxt;
          curEvent.ticketCost = <models.TicketAmtInfo[]> injectedHelpers.parseTicketString(rawTixPriceTxt);
        } else {
          log.infoLogs.push(`No ticket info found in .eventCost first child span for page: ${deps.curUri}`);
        }
      }
      
      // let fbShareElem = curCtx.querySelector('.share-events.share-plus .share-facebook a:first-child');
      // if (fbShareElem) {
      //   curEvent.facebookShareUri = fbShareElem.getAttribute("href");
      // } else {
      //   log.infoLogs.push(`No FB Share info found in .share-events.share-plus .share-facebook a:first-child for page: ${deps.curUri}`);
      // }

      // let twitterShareElem = curCtx.querySelector('.share-events.share-plus .share-twitter a:first-child');
      // if (twitterShareElem) {
      //   curEvent.twitterShareUri = twitterShareElem.getAttribute("href");
      // } else {
      //   log.infoLogs.push(`No Twitter Share info found in .share-events.share-plus .share-twitter a:first-child for page: ${deps.curUri}`);
      // }

      // let iCalElem = curCtx.querySelector('.ical-sync a');
      // if (iCalElem) {
      //   curEvent.iCalUri = iCalElem.getAttribute("href");
      // } else {
      //   log.infoLogs.push(`No iCal info found in  for page: ${deps.curUri}`);
      // }

      // let gCalElem = curCtx.querySelector('.gcal-sync a');
      // if (gCalElem) {
      //   curEvent.gCalUri = gCalElem.getAttribute("href");
      // } else {
      //   log.infoLogs.push(`No gCal info found in  for page: ${deps.curUri}`);
      // }

      let artistBoxCtx = curCtx.querySelectorAll(".singleEventDetails");
      for (let artistBoxElem of artistBoxCtx||[]) {
        let performerNameElem = artistBoxElem.querySelector('#eventTitle');
        let performerNameElemTitle = performerNameElem.getAttribute('title');
        if (performerNameElemTitle) {

        let curPerformer = <models.CapturePerformer> { 
          performerName: performerNameElemTitle.trim(),
          performerUris: [],
          performerImageUris: []
        };

        curPerformer.isPrimaryPerformer = mainPerformer.toLowerCase()==curPerformer.performerName.toLowerCase();

        // let linksCtx = artistBoxElem.querySelectorAll('ul.tfly-more li a');
        // for(let linkElem of linksCtx||[]) {
        //   let link = linkElem.getAttribute('href');
        //   if (!link.match(/^#\w+/)) {
        //     curPerformer.performerUris.push(link);
        //   }
        // }

        //get performer bio image
        let bioImgElem1 = artistBoxElem.querySelector('.eventImgBox');
        let bioImgElem1Img = bioImgElem1.querySelector('img');
       // let bioImgElem2 = artistBoxElem.querySelector('img.bio-image-no-float');
        let bioImgElem = bioImgElem1Img//||bioImgElem2;
        if (bioImgElem) {
          curPerformer.performerImageUris.push(bioImgElem.getAttribute("src"));
        } else {
          log.infoLogs.push(`No Performer image found in .eventImgBox first child img for ${curPerformer.performerName} for page: ${deps.curUri}`);
        }

        //get performer bio
        // let bioElem = artistBoxElem.querySelector('div.bio');
        // if (bioElem) {
        //   curPerformer.performerDesc = bioElem.innerText.trim();
        // } else {
        //   log.infoLogs.push(`No Performer Bio found in div.bio for ${curPerformer.performerName} for page: ${deps.curUri}`);
        // }

        curEvent.performers.push(curPerformer);
        } else {
        log.warningLogs.push(`No Performer Name in page: ${deps.curUri}`);
        }
      }
      //get any performer info if there's no dedicated artist box
      // let performerDoubleCheck = 
      //   ([...curCtx.querySelectorAll('div.event-info h1.headliners, div.event-info h2.supports')]
      //   .map((x,i) => { 
      //     return {
      //       performerName: x.innerText.trim(),
      //       performerUris: [],
      //       performerImageUris: [],
      //       isPrimaryPerformer: i ==0
      //     } as CapturePerformer
      //     } ));
      // for(let p of performerDoubleCheck) {
      //   if (curEvent.performers.findIndex(x => x.performerName.toLowerCase()==p.performerName.toLowerCase()) == -1) {
      //     curEvent.performers.push(p);
      //   }
      // }
    } else if (detailCtx.length > 1) {
      log.warningLogs.push(`Expected only 1 Detail Container Element, but there are ${detailCtx.length} for page: ${deps.curUri}`);
    } 
  }
  catch(e) {
    log.errorLogs.push(`Capture Detail Page Exception Thrown: ${e.message} at ${deps.curUri}`);
  }
  
  return [log, curEvent];
};



