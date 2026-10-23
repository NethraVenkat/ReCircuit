import "./redesign-reporting.mjs";
// Finite read-only setup: compile development portal routes before timed worker navigation.
for(const [port,routes] of [[3101,["/","/accepted-items","/pickup-charges","/book-pickup","/track"]],[3102,["/","/what-we-take","/schedule","/status"]],[3103,["/","/rates","/pickup","/track-order"]]]){
  for(const route of routes){let response;for(let n=0;n<60;n++){try{response=await fetch(`http://localhost:${port}${route}`);if(response.ok)break;}catch{}await new Promise(r=>setTimeout(r,1000));}if(!response?.ok)throw new Error(`Local fixture route unavailable: ${port}${route}`);console.log(`READY local fixture ${port}${route}`);}
}
