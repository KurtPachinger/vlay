# vlay
3d object projects geometric systems it infers from texture raycast. 
- fit weighted estimate of: median/positive/negative, connected system, proximity
- generate volumetric environment, secondary detail, meta blend

Local space is used to seed a verifiable result. Generative details may be reproduced from a small key, motion texture, or any practial resource. Applications range from fantasy terrain to atmospheric effects.

## texture to topology


1. homography: pass map(s)
   - noise / use seed
   - boxmap
      - RB: land/water (quadtree, game of life)
      - A: topo depth (centroid & contour fit line)
      - G: foliage coverage, detail pass
2. graph cut: procedural voxels
   - topography: displace, erode top, dilate bottom
   - systems: accumulate, fit samples to threshold
      - defect, poi
      - connected, hull
   - classify: pos/neg
3. tertiary: texture, surfaces, LOD
