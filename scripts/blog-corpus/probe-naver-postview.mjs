const url="https://blog.naver.com/PostView.naver?blogId=roooad&logNo=224167447687&redirect=Dlog&widgetTypeCall=true";
const res=await fetch(url,{headers:{"user-agent":"Mozilla/5.0","referer":"https://blog.naver.com/roooad"}});
const html=await res.text();
console.log("STATUS",res.status,"LEN",html.length,"TYPE",res.headers.get("content-type"));
for(const needle of ["se-main-container","se-viewer","국물이 끝장났던","소나무식당","__se_component_area"]) {
  console.log("HAS",needle,html.includes(needle));
}
console.log("HEAD",html.slice(0,1200).replace(/\s+/g," "));
console.log("SE_INDEX",html.indexOf("se-main-container"),html.indexOf("se-viewer"));
