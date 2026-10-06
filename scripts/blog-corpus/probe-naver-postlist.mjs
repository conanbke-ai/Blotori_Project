const blogId = process.env.BLOG_ID || "roooad";
const urls = [
  `https://blog.naver.com/PostTitleListAsync.naver?blogId=${blogId}&viewdate=&currentPage=1&categoryNo=0&parentCategoryNo=&countPerPage=30`,
  `https://blog.naver.com/PostTitleListAsync.naver?blogId=${blogId}&currentPage=1&categoryNo=0&countPerPage=30`,
  `https://blog.naver.com/PostList.naver?blogId=${blogId}&currentPage=1&categoryNo=0`,
];
for (const url of urls) {
  try {
    const res = await fetch(url, { headers: { "user-agent":"Mozilla/5.0", "referer":`https://blog.naver.com/${blogId}` } });
    const text = await res.text();
    console.log("PROBE", res.status, res.headers.get("content-type"), url);
    console.log(text.slice(0,3500).replace(/\s+/g," "));
    console.log("END_PROBE");
  } catch (e) {
    console.log("PROBE_FAIL",url,String(e));
  }
}
