// Small Canvas 2D backend for the drawing operations used by AUVIONA's UniversePainter.
export const BlendMode={Screen:'screen',SrcOver:'source-over'},PaintStyle={Stroke:'stroke'},StrokeCap={Round:'round'},StrokeJoin={Round:'round'},TileMode={Clamp:0};
function color(value){
  if(value.startsWith('#')){const n=parseInt(value.slice(1),16);return new Float32Array([(n>>16&255)/255,(n>>8&255)/255,(n&255)/255,1]);}
  const values=value.match(/[\d.]+/g).map(Number);return new Float32Array([values[0]/255,values[1]/255,values[2]/255,values[3]??1]);
}
const css=c=>`rgba(${c[0]*255},${c[1]*255},${c[2]*255},${c[3]})`;
class Paint{
  constructor(){this.color=color('#FFFFFF');this.alpha=1;this.blend='source-over';this.width=1;this.style='fill';}
  setAntiAlias(){} setDither(){} setColor(c){this.color=c;} setAlphaf(a){this.alpha=a;} setBlendMode(b){this.blend=b;} setStyle(s){this.style=s;} setStrokeWidth(w){this.width=w;} setStrokeCap(){} setStrokeJoin(){} setShader(s){this.shader=s;}
}
class Surface{
  constructor(w,h){this.image=document.createElement('canvas');this.pixelRatio=Math.min(devicePixelRatio||1,2);this.image.width=Math.ceil(w*this.pixelRatio);this.image.height=Math.ceil(h*this.pixelRatio);this.ctx=this.image.getContext('2d');this.ctx.scale(this.pixelRatio,this.pixelRatio);this.w=w;this.h=h;}
  save(){this.ctx.save();} restore(){this.ctx.restore();} translate(x,y){this.ctx.translate(x,y);} scale(x,y){this.ctx.scale(x,y);}
  withPaint(p,draw){const c=this.ctx;c.save();c.globalAlpha=p.alpha;c.globalCompositeOperation=p.blend;c.lineWidth=p.width;c.lineCap='round';c.lineJoin='round';let fill=css(p.color);if(p.shader){const s=p.shader;fill=s.type==='radial'?c.createRadialGradient(s.point.x,s.point.y,0,s.point.x,s.point.y,s.radius):c.createLinearGradient(s.start.x,s.start.y,s.end.x,s.end.y);s.colors.forEach((col,i)=>fill.addColorStop(s.positions?.[i]??i/(s.colors.length-1),css(col)));}c.fillStyle=c.strokeStyle=fill;draw(c);c.restore();}
  drawRect(r,p){this.withPaint(p,c=>c.fillRect(r.x,r.y,r.width,r.height));}
  drawCircle(x,y,r,p){this.withPaint(p,c=>{c.beginPath();c.arc(x,y,Math.max(0,r),0,Math.PI*2);p.style==='stroke'?c.stroke():c.fill();});}
  drawLine(x1,y1,x2,y2,p){this.withPaint(p,c=>{c.beginPath();c.moveTo(x1,y1);c.lineTo(x2,y2);c.stroke();});}
  drawPath(path,p){this.withPaint(p,c=>c.stroke(path));}
  drawPicture(pic){this.ctx.drawImage(pic.image,0,0,pic.w,pic.h);}
}
class Recorder{
  beginRecording(r){if(!this.backdropFinished){this.current=new Surface(r.width,r.height);}else{this.frame??=new Surface(r.width,r.height);this.current=this.frame;this.current.ctx.clearRect(0,0,r.width,r.height);}return this.current;}
  finishRecordingAsPicture(){this.backdropFinished=true;return this.current;}
}
class Builder{reset(){this.path=new Path2D();}moveTo(x,y){this.path.moveTo(x,y);}quadTo(a,b,c,d){this.path.quadraticCurveTo(a,b,c,d);}lineTo(x,y){this.path.lineTo(x,y);}build(){return this.path;}}
export const Skia={Color:color,Paint:()=>new Paint(),PictureRecorder:()=>new Recorder(),XYWHRect:(x,y,width,height)=>({x,y,width,height}),Point:(x,y)=>({x,y}),PathBuilder:{Make:()=>new Builder()},Shader:{MakeRadialGradient:(point,radius,colors,positions)=>({type:'radial',point,radius,colors,positions}),MakeLinearGradient:(start,end,colors,positions)=>({type:'linear',start,end,colors,positions})}};
