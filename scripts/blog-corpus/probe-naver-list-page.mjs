const urls=[
 "https://blog.naver.com/PostList.naver?blogId=roooad&currentPage=1&categoryNo=0",
 "https://blog.naver.com/PostList.naver?blogId=roooad&from=postList&categoryNo=0&currentPage=1",
 "https://blog.naver.com/PostList.naver?blogId=roooad&categoryNo=0&currentPage=2"
];
for(const url of urls){
 const res=await fetch(url,{headers:{"user-agent":"Mozilla/5.0","referer":"https://blog.naver.com/roooad"}});
 const html=await res.text();
 const mains=(html.match(/se-main-container/g)||[]).length;
 const viewers=(html.match(/se-viewer/g)||[]).length;
 const logs=[...html.matchAll(/logNo[=:"'&]+(\d{8,})/g)].map(m=>m[1]);
 console.log("LIST_PAGE",res.status,html.length,"mains",mains,"viewers",viewers,"uniqueLogs",JSON.stringify([...new Set(logs)].slice(0,10)),url);
}
