#!/usr/bin/env python3
"""Convert raw Mixamo animation FBXs to shared animation-only GLBs; navigation owns horizontal translation."""
import argparse,json,re,sys
from pathlib import Path
import bpy
REQUIRED={'hips','spine','spine1','spine2','neck','head','leftarm','leftforearm','lefthand','rightarm','rightforearm','righthand','leftupleg','leftleg','leftfoot','rightupleg','rightleg','rightfoot'}
MOVE=('walk','run','sprint','crawl','moving','prone forward','prone backwards','backward in prone')
def canon(n):
 n=n.split('|')[-1].split(':')[-1].lower();n=re.sub(r'^mixamorig','',n);n=re.sub(r'[^a-z0-9]','',n)
 aliases={'pelvis':'hips','spine0':'spine','spine01':'spine1','spine02':'spine2','spine001':'spine1','spine002':'spine2'}
 return aliases.get(n,n)
def slug(s):return re.sub(r'[^a-z0-9]+','-',s.lower()).strip('-')
def moving(s):return any(x in s.lower() for x in MOVE)
def clear():bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
def script_args():
 return sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
def main():
 p=argparse.ArgumentParser();p.add_argument('--input',required=True);p.add_argument('--output',required=True);a=p.parse_args(script_args());src=Path(a.input);out=Path(a.output);out.mkdir(parents=True,exist_ok=True);clips=[];failed=[];reference_file='mixamo-reference-rest.glb';reference_source=None
 for f in sorted(src.glob('*.fbx')):
  clear()
  try:
   # Animation GLBs stay in POSE evaluation so their authored keys survive. Separately export one
   # animation armature in REST mode as the source-rig reference. Babylon restores each source
   # hierarchy from that reference immediately before retargeting, then leaves the animation free.
   bpy.ops.import_scene.fbx(filepath=str(f),use_anim=True,automatic_bone_orientation=False,use_prepost_rot=True);arms=[o for o in bpy.context.scene.objects if o.type=='ARMATURE']
   if not arms:raise RuntimeError('no armature')
   arm=arms[0];bones={canon(b.name):b for b in arm.data.bones};miss=sorted(REQUIRED-set(bones))
   if miss:raise RuntimeError('missing required bones: '+','.join(miss))
   act=arm.animation_data and arm.animation_data.action
   if not act:raise RuntimeError('no action')
   for o in list(bpy.context.scene.objects):
    if o.type=='MESH':bpy.data.objects.remove(o,do_unlink=True)
   bpy.context.view_layer.objects.active=arm;arm.select_set(True)
   if reference_source is None:
    arm.data.pose_position='REST';bpy.context.view_layer.update()
    bpy.ops.export_scene.gltf(filepath=str(out/reference_file),export_format='GLB',use_selection=False,export_animations=False,export_skins=True)
    reference_source=f.name
   hips=bones['hips'].name;loc=moving(f.stem);norm=0
   if loc:
    for fc in act.fcurves:
     if fc.data_path==f'pose.bones["{hips}"].location' and fc.array_index in (0,1):
      for k in fc.keyframe_points:k.co.y=0;k.handle_left.y=0;k.handle_right.y=0
      norm+=1
   arm.data.pose_position='POSE';bpy.context.view_layer.update()
   dest=out/(slug(f.stem)+'.glb');bpy.ops.export_scene.gltf(filepath=str(dest),export_format='GLB',use_selection=False,export_animations=True,export_skins=True,export_current_frame=False,export_reset_pose_bones=True)
   clips.append({'clip':slug(f.stem),'source':f.name,'file':dest.name,'inPlaceXZ':loc,'rootCurvesNormalized':norm,'hipsBone':hips,'frames':[int(act.frame_range[0]),int(act.frame_range[1])],'fps':int(bpy.context.scene.render.fps),'boneOrientation':'source-rest-preserved','referencePoseMethod':'shared-rest-glb-runtime-restore','animationEvaluation':'pose'})
  except Exception as e:failed.append({'source':f.name,'error':str(e)});print('FAILED',f.name,e,file=sys.stderr)
 (out/'manifest.json').write_text(json.dumps({'version':11,'rig':'mixamo-compatible','shared':True,'source':'Assets/animations/*.fbx','boneOrientation':'source-rest-preserved','referenceFile':reference_file if reference_source else None,'referenceSource':reference_source,'referencePoseMethod':'shared-rest-glb-runtime-restore','animationEvaluation':'pose','retargeting':'Babylon AnimatorAvatar source-rest reference-pose compensation','rootMotion':'detected locomotion horizontal travel stripped; vertical preserved','clips':clips,'failed':failed},indent=2)+'\n');return 1 if failed else 0
if __name__=='__main__':raise SystemExit(main())
