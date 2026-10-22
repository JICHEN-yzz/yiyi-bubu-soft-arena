"""Build high-fidelity stylized 3D models of Yiyi and Bubu.

Reference basis:
- 一二: white panda, black ears and feet, pink cheeks, dark neck bow.
- 布布: tea-brown bear, dark inner ears, golden cheeks, no neck bow.

The room project is intentionally not imported or referenced. All geometry is
generated from the two character turnaround images and remains editable.
"""

import bpy
import bmesh
import math
import os
from mathutils import Vector


OUT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSET_DIR = os.path.join(OUT_DIR, "assets")
QA_DIR = os.path.join(OUT_DIR, "qa")
os.makedirs(ASSET_DIR, exist_ok=True)
os.makedirs(QA_DIR, exist_ok=True)
BLEND_PATH = os.path.join(ASSET_DIR, "一二布布_格斗版模型.blend")
GLB_PATH = os.path.join(ASSET_DIR, "characters_v2.glb")
MAIN_RENDER = os.path.join(QA_DIR, "model-v2-front.png")
SIDE_RENDER = os.path.join(QA_DIR, "model-v2-side.png")
BACK_RENDER = os.path.join(QA_DIR, "model-v2-back.png")
THREE_QUARTER_RENDER = os.path.join(QA_DIR, "model-v2-three-quarter.png")

GROUND_Z = 0.0


def srgb_to_linear(value):
    return value / 12.92 if value <= 0.04045 else ((value + 0.055) / 1.055) ** 2.4


def rgba(hex_rgb, alpha=1.0):
    value = hex_rgb.lstrip("#")
    rgb = [int(value[i:i + 2], 16) / 255.0 for i in (0, 2, 4)]
    return tuple(srgb_to_linear(channel) for channel in rgb) + (alpha,)


def clean_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1800
    scene.render.resolution_y = 1200
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    scene.render.film_transparent = False
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Medium High Contrast"
    try:
        scene.eevee.taa_render_samples = 96
    except Exception:
        pass
    scene.world = bpy.data.worlds.new("WORLD_奶油柔光")
    scene.world.use_nodes = True
    background = scene.world.node_tree.nodes.get("Background")
    background.inputs["Color"].default_value = rgba("#F7F1E9")
    background.inputs["Strength"].default_value = 0.45
    return scene


def collection(name):
    coll = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(coll)
    return coll


def move_to_collection(obj, coll):
    for old_collection in list(obj.users_collection):
        old_collection.objects.unlink(obj)
    coll.objects.link(obj)
    return obj


def smooth_mesh(obj):
    if obj.type == "MESH":
        for polygon in obj.data.polygons:
            polygon.use_smooth = True
    return obj


def add_weighted_normal(obj):
    if obj.type == "MESH":
        modifier = obj.modifiers.new("柔化法线", "WEIGHTED_NORMAL")
        modifier.keep_sharp = True
        modifier.weight = 45
    return obj


def make_material(name, color, roughness=0.68, coat=0.0, metallic=0.0):
    material = bpy.data.materials.new(name)
    material.diffuse_color = rgba(color)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    bsdf = nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = rgba(color)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    if "Coat Weight" in bsdf.inputs:
        bsdf.inputs["Coat Weight"].default_value = coat
    if "Coat Roughness" in bsdf.inputs:
        bsdf.inputs["Coat Roughness"].default_value = 0.10
    if "Specular IOR Level" in bsdf.inputs:
        bsdf.inputs["Specular IOR Level"].default_value = 0.38
    material["色值"] = color
    return material


def make_skin_material(name, color):
    material = make_material(name, color, roughness=0.72, coat=0.045)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    bsdf = nodes.get("Principled BSDF")
    noise = nodes.new("ShaderNodeTexNoise")
    noise.name = "极细绒面纹理"
    noise.inputs["Scale"].default_value = 95.0
    noise.inputs["Detail"].default_value = 2.2
    noise.inputs["Roughness"].default_value = 0.58
    bump = nodes.new("ShaderNodeBump")
    bump.name = "微米级绒面起伏"
    bump.inputs["Strength"].default_value = 0.035
    bump.inputs["Distance"].default_value = 0.006
    links.new(noise.outputs["Fac"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return material


def parent_in_character_space(obj, parent):
    """Parent without compensating the character root translation.

    Object coordinates are authored in character-local space, so the root must
    be allowed to move and rotate the complete figure as one unit.
    """
    obj.parent = parent
    obj.matrix_parent_inverse.identity()
    return obj


def superellipsoid(name, location, radii, material, coll,
                   latitude_power=0.72, longitude_power=0.72,
                   segments=64, rings=36):
    """Rounded-square solid with a clean quad-dominant surface."""
    vertices = [(0.0, 0.0, radii[2])]
    for ring in range(1, rings):
        latitude = math.pi / 2.0 - math.pi * ring / rings
        cos_lat = math.cos(latitude)
        sin_lat = math.sin(latitude)
        ring_scale = abs(cos_lat) ** latitude_power
        z = math.copysign(abs(sin_lat) ** latitude_power, sin_lat) * radii[2]
        for segment in range(segments):
            longitude = math.tau * segment / segments
            cos_lon = math.cos(longitude)
            sin_lon = math.sin(longitude)
            x = math.copysign(abs(cos_lon) ** longitude_power, cos_lon)
            y = math.copysign(abs(sin_lon) ** longitude_power, sin_lon)
            vertices.append((
                x * ring_scale * radii[0],
                y * ring_scale * radii[1],
                z,
            ))

    bottom = len(vertices)
    vertices.append((0.0, 0.0, -radii[2]))
    faces = []
    first = 1
    for segment in range(segments):
        next_segment = (segment + 1) % segments
        faces.append((0, first + segment, first + next_segment))

    for ring in range(rings - 2):
        lower = 1 + ring * segments
        upper = lower + segments
        for segment in range(segments):
            next_segment = (segment + 1) % segments
            faces.append((
                lower + segment,
                upper + segment,
                upper + next_segment,
                lower + next_segment,
            ))

    last = 1 + (rings - 2) * segments
    for segment in range(segments):
        next_segment = (segment + 1) % segments
        faces.append((last + segment, bottom, last + next_segment))

    mesh = bpy.data.meshes.new(name + "_网格")
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(material)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    coll.objects.link(obj)
    obj.location = location
    smooth_mesh(obj)
    add_weighted_normal(obj)
    return obj


def ellipsoid(name, location, scale, material, coll, rotation=(0.0, 0.0, 0.0),
              segments=32, rings=16):
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=segments,
        ring_count=rings,
        radius=1.0,
        location=location,
        rotation=rotation,
    )
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    move_to_collection(obj, coll)
    obj.data.materials.append(material)
    smooth_mesh(obj)
    add_weighted_normal(obj)
    return obj


def curve_tube(name, points, material, coll, radius=0.012):
    curve = bpy.data.curves.new(name + "_曲线", "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = 20
    curve.render_resolution_u = 24
    curve.bevel_depth = radius
    curve.bevel_resolution = 4
    spline = curve.splines.new("BEZIER")
    spline.bezier_points.add(len(points) - 1)
    for bezier_point, point in zip(spline.bezier_points, points):
        bezier_point.co = point
        bezier_point.handle_left_type = "AUTO"
        bezier_point.handle_right_type = "AUTO"
    obj = bpy.data.objects.new(name, curve)
    coll.objects.link(obj)
    obj.data.materials.append(material)
    return obj


def torus(name, location, major_radius, minor_radius, material, coll,
          rotation=(0.0, 0.0, 0.0)):
    bpy.ops.mesh.primitive_torus_add(
        major_segments=64,
        minor_segments=16,
        major_radius=major_radius,
        minor_radius=minor_radius,
        location=location,
        rotation=rotation,
    )
    obj = bpy.context.object
    obj.name = name
    move_to_collection(obj, coll)
    obj.data.materials.append(material)
    smooth_mesh(obj)
    return obj


def extruded_face_shape(name, points_xz, center_y, thickness, material, coll,
                        bevel_width=0.018):
    """Small extruded graphic element for the flattened bow silhouette."""
    front_y = center_y - thickness / 2.0
    back_y = center_y + thickness / 2.0
    count = len(points_xz)
    vertices = [(x, front_y, z) for x, z in points_xz]
    vertices += [(x, back_y, z) for x, z in points_xz]
    faces = [
        tuple(range(count)),
        tuple(range(count, count * 2))[::-1],
    ]
    for index in range(count):
        next_index = (index + 1) % count
        faces.append((index, next_index, count + next_index, count + index))
    mesh = bpy.data.meshes.new(name + "_网格")
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(material)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    coll.objects.link(obj)
    bevel = obj.modifiers.new("圆润领结边缘", "BEVEL")
    bevel.width = bevel_width
    bevel.segments = 4
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.modifier_apply(modifier=bevel.name)
    obj.select_set(False)
    smooth_mesh(obj)
    return obj


def make_outline(obj, material, coll, factor=1.012):
    """Inverted-hull outline that reads like the black line in the references."""
    duplicate = obj.copy()
    duplicate.data = obj.data.copy()
    duplicate.name = "OUTLINE_" + obj.name
    duplicate.data.name = duplicate.name + "_网格"
    coll.objects.link(duplicate)
    duplicate.matrix_world = obj.matrix_world
    duplicate.scale = tuple(component * factor for component in obj.scale)
    duplicate.data.materials.clear()
    duplicate.data.materials.append(material)

    bm = bmesh.new()
    bm.from_mesh(duplicate.data)
    bmesh.ops.reverse_faces(bm, faces=list(bm.faces))
    bm.to_mesh(duplicate.data)
    bm.free()
    duplicate.data.update()
    duplicate.hide_render = False
    duplicate["隐藏轮廓层"] = True
    return duplicate


def add_armature(name, root, coll):
    armature_data = bpy.data.armatures.new(name + "_骨架数据")
    armature = bpy.data.objects.new(name + "_RIG", armature_data)
    coll.objects.link(armature)
    armature.parent = root
    armature.show_in_front = True
    armature.data.display_type = "STICK"
    armature.hide_render = True

    bpy.context.view_layer.objects.active = armature
    armature.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    specs = [
        ("Root", (0.0, 0.0, 0.05), (0.0, 0.0, 0.42), None),
        ("Spine", (0.0, 0.0, 0.42), (0.0, 0.0, 1.62), "Root"),
        ("Head", (0.0, 0.0, 1.28), (0.0, 0.0, 2.70), "Spine"),
        ("Arm.L", (-0.40, 0.0, 1.44), (-0.64, 0.0, 0.78), "Spine"),
        ("Arm.R", (0.40, 0.0, 1.44), (0.64, 0.0, 0.78), "Spine"),
        ("Leg.L", (-0.24, 0.0, 0.58), (-0.28, 0.0, 0.10), "Root"),
        ("Leg.R", (0.24, 0.0, 0.58), (0.28, 0.0, 0.10), "Root"),
        ("Tail", (0.0, 0.24, 0.95), (0.0, 0.60, 0.96), "Root"),
    ]
    for bone_name, head, tail, parent_name in specs:
        bone = armature_data.edit_bones.new(bone_name)
        bone.head = head
        bone.tail = tail
        bone.use_deform = False
        if parent_name:
            bone.parent = armature_data.edit_bones[parent_name]
            bone.use_connect = False
    bpy.ops.object.mode_set(mode="OBJECT")
    armature.select_set(False)
    armature["用途"] = "角色动作骨架；网格按部件命名，可继续蒙皮或刚性绑定。"
    return armature


def build_character(name, kind, root_x, coll, materials):
    is_yiyi = kind == "yiyi"
    root = bpy.data.objects.new("ROOT_" + name, None)
    coll.objects.link(root)
    root.empty_display_type = "CIRCLE"
    root.empty_display_size = 0.32
    root.location = (root_x, 0.0, GROUND_Z)
    root["角色"] = name
    root["设定依据"] = "用户提供的正面、侧面、背面多视角原图"
    root["配色说明"] = "白色熊猫 / 奶茶棕小熊"

    finger_material = materials["dark"]
    if is_yiyi:
        skin = materials["yiyi_white"]
        head_radii = (0.805, 0.485, 0.780)
        head_z = 2.025
        body_radii = (0.635, 0.435, 0.690)
        body_z = 1.020
        head_power = (0.68, 0.69)
        body_power = (0.91, 0.79)
    else:
        skin = materials["bubu_brown"]
        head_radii = (0.900, 0.505, 0.750)
        head_z = 2.020
        body_radii = (0.675, 0.450, 0.700)
        body_z = 1.020
        head_power = (0.67, 0.68)
        body_power = (0.94, 0.80)

    body = superellipsoid(
        name + "_01_圆润躯干",
        (0.0, 0.0, body_z),
        body_radii,
        skin,
        coll,
        latitude_power=body_power[0],
        longitude_power=body_power[1],
    )
    head = superellipsoid(
        name + "_02_圆角方形头部",
        (0.0, 0.0, head_z),
        head_radii,
        skin,
        coll,
        latitude_power=head_power[0],
        longitude_power=head_power[1],
    )

    head_bottom_z = head_z - head_radii[2]
    body_top_z = body_z + body_radii[2]
    root["头部与身体重叠高度"] = round(body_top_z - head_bottom_z, 3)

    # Ears are broad and shallow, matching the front and side turnarounds.
    if is_yiyi:
        ear_z = 2.695
        ear_x = 0.695
        for side, sign in (("L", -1), ("R", 1)):
            ear = ellipsoid(
                name + "_03_黑色圆耳_" + side,
                (sign * ear_x, -0.105, ear_z),
                (0.195, 0.145, 0.205),
                materials["dark"],
                coll,
                rotation=(0.0, sign * math.radians(7), 0.0),
            )
            make_outline(ear, materials["outline"], coll, 1.011)
    else:
        ear_z = 2.710
        ear_x = 0.705
        for side, sign in (("L", -1), ("R", 1)):
            ear = ellipsoid(
                name + "_03_深棕圆耳_" + side,
                (sign * ear_x, -0.080, ear_z),
                (0.225, 0.155, 0.230),
                materials["bubu_ear"],
                coll,
                rotation=(0.0, sign * math.radians(6), 0.0),
            )
            make_outline(ear, materials["outline"], coll, 1.010)
            inner = ellipsoid(
                name + "_04_耳窝_" + side,
                (sign * ear_x, -0.208, ear_z + 0.004),
                (0.135, 0.030, 0.145),
                materials["bubu_ear_inner"],
                coll,
                rotation=(0.0, sign * math.radians(6), 0.0),
            )
            make_outline(inner, materials["outline"], coll, 1.006)

    face_y = -0.468 if is_yiyi else -0.490
    eye_x = 0.260 if is_yiyi else 0.270
    eye_z = 2.075 if is_yiyi else 2.045
    eye_scale = (0.052, 0.026, 0.062) if is_yiyi else (0.057, 0.028, 0.067)
    for side, sign in (("L", -1), ("R", 1)):
        eye = ellipsoid(
            name + "_05_豆豆眼_" + side,
            (sign * eye_x, face_y - 0.012, eye_z),
            eye_scale,
            materials["eye"],
            coll,
            segments=48,
            rings=24,
        )
        highlight = ellipsoid(
            name + "_06_眼神高光_" + side,
            (sign * eye_x - 0.012, face_y - 0.040, eye_z + 0.020),
            (0.012, 0.007, 0.014),
            materials["highlight"],
            coll,
            segments=24,
            rings=12,
        )

    brow_inner_x = 0.145
    brow_outer_x = 0.390
    brow_inner_z = eye_z + 0.188
    brow_outer_z = eye_z + 0.235
    curve_tube(
        name + "_07_左眉_倒八字",
        [
            (-brow_outer_x, face_y - 0.008, brow_outer_z),
            (-0.275, face_y - 0.018, brow_outer_z + 0.012),
            (-brow_inner_x, face_y - 0.008, brow_inner_z),
        ],
        materials["ink"],
        coll,
        radius=0.014,
    )
    curve_tube(
        name + "_07_右眉_倒八字",
        [
            (brow_inner_x, face_y - 0.008, brow_inner_z),
            (0.275, face_y - 0.018, brow_outer_z + 0.012),
            (brow_outer_x, face_y - 0.008, brow_outer_z),
        ],
        materials["ink"],
        coll,
        radius=0.014,
    )

    mouth_y = face_y - 0.035
    mouth_z = eye_z - 0.205
    curve_tube(
        name + "_08_波浪嘴",
        [
            (-0.102, mouth_y, mouth_z + 0.030),
            (-0.050, mouth_y - 0.004, mouth_z - 0.018),
            (0.0, mouth_y - 0.010, mouth_z + 0.006),
            (0.050, mouth_y - 0.004, mouth_z - 0.018),
            (0.102, mouth_y, mouth_z + 0.030),
        ],
        materials["ink"],
        coll,
        radius=0.0115,
    )

    cheek_x = 0.435 if is_yiyi else 0.470
    cheek_z = 1.925 if is_yiyi else 1.895
    cheek_scale = (0.165, 0.024, 0.125) if is_yiyi else (0.205, 0.026, 0.150)
    cheek_material = materials["yiyi_blush"] if is_yiyi else materials["bubu_blush"]
    for side, sign in (("L", -1), ("R", 1)):
        ellipsoid(
            name + "_09_腮红_" + side,
            (sign * cheek_x, face_y + 0.010, cheek_z),
            cheek_scale,
            cheek_material,
            coll,
            segments=48,
            rings=24,
        )

    # Short pear-shaped arms with oversized rounded paws.
    arm_material = skin if is_yiyi else skin
    for side, sign in (("L", -1), ("R", 1)):
        arm = ellipsoid(
            name + "_10_短手臂_" + side,
            (sign * 0.690, -0.006, 1.135),
            (0.185, 0.215, 0.315),
            arm_material,
            coll,
            rotation=(0.0, sign * math.radians(-7), 0.0),
        )
        make_outline(arm, materials["outline"], coll, 1.012)
        hand = ellipsoid(
            name + "_11_圆手掌_" + side,
            (sign * 0.735, -0.040, 0.825),
            (0.190, 0.215, 0.200),
            arm_material,
            coll,
            rotation=(0.0, sign * math.radians(-4), 0.0),
        )
        make_outline(hand, materials["outline"], coll, 1.012)

    # Panda feet are black; Bubu's feet remain intentionally simple and seamless.
    for side, sign in (("L", -1), ("R", 1)):
        leg = ellipsoid(
            name + "_12_短腿_" + side,
            (sign * 0.285, 0.006, 0.285),
            (0.240, 0.260, 0.275),
            skin,
            coll,
        )
        make_outline(leg, materials["outline"], coll, 1.012)
        if is_yiyi:
            foot = ellipsoid(
                name + "_13_黑色脚掌_" + side,
                (sign * 0.285, -0.108, 0.130),
                (0.245, 0.305, 0.145),
                materials["dark"],
                coll,
            )
            make_outline(foot, materials["outline"], coll, 1.011)
            for toe in (-0.065, 0.0, 0.065):
                curve_tube(
                    name + "_14_脚趾缝_" + side + "_" + str(toe),
                    [
                        (sign * 0.285 + toe, -0.398, 0.105),
                        (sign * 0.285 + toe, -0.408, 0.147),
                    ],
                    materials["derived_black"],
                    coll,
                    radius=0.007,
                )

    # Black bow at the neck, only on Yiyi.
    if is_yiyi:
        bow_y = -0.402
        bow_z = 1.405
        for side, sign in (("L", -1), ("R", 1)):
            outline_points = [
                (sign * 0.018, 0.058),
                (sign * 0.112, 0.102),
                (sign * 0.245, 0.062),
                (sign * 0.240, -0.022),
                (sign * 0.134, -0.112),
                (sign * 0.022, -0.058),
            ]
            lobe = extruded_face_shape(
                name + "_15_领结翼_" + side,
                [(x, bow_z + z) for x, z in outline_points],
                bow_y,
                0.062,
                materials["bow"],
                coll,
                bevel_width=0.023,
            )
            make_outline(lobe, materials["outline"], coll, 1.011)
        knot = ellipsoid(
            name + "_16_领结中心",
            (0.0, bow_y - 0.025, bow_z),
            (0.070, 0.055, 0.070),
            materials["bow"],
            coll,
            segments=40,
            rings=20,
        )
        make_outline(knot, materials["outline"], coll, 1.011)

    # Rear tail treatment: a visible round mark from the back and a small nub from the side.
    if is_yiyi:
        rear_tail = ellipsoid(
            name + "_17_背面圆形尾巴",
            (0.0, 0.462, 0.930),
            (0.082, 0.038, 0.102),
            materials["dark"],
            coll,
        )
        side_tail = ellipsoid(
            name + "_18_侧面小尾巴",
            (0.600, 0.285, 0.930),
            (0.105, 0.135, 0.115),
            materials["dark"],
            coll,
            rotation=(0.0, math.radians(18), 0.0),
        )
        make_outline(side_tail, materials["outline"], coll, 1.012)
    else:
        torus(
            name + "_17_背面尾巴外圈",
            (0.0, 0.485, 0.930),
            0.092,
            0.018,
            materials["bubu_ear"],
            coll,
            rotation=(math.radians(90), 0.0, 0.0),
        )
        ellipsoid(
            name + "_18_背面尾巴内芯",
            (0.0, 0.495, 0.930),
            (0.070, 0.025, 0.070),
            skin,
            coll,
        )
        side_tail = ellipsoid(
            name + "_18_侧面小尾巴",
            (0.660, 0.298, 0.940),
            (0.115, 0.135, 0.120),
            skin,
            coll,
            rotation=(0.0, math.radians(16), 0.0),
        )
        make_outline(side_tail, materials["outline"], coll, 1.012)

    # The outline hull is created after the main skin parts.
    make_outline(body, materials["outline"], coll, 1.004)
    make_outline(head, materials["outline"], coll, 1.005)

    # Parent every visual object to the character root for easy turnarounds and GLB export.
    for obj in list(coll.objects):
        if obj is root:
            continue
        parent_in_character_space(obj, root)

    add_armature(name, root, coll)
    root["网格对象数"] = len([obj for obj in coll.objects if obj.type == "MESH"])
    return root


def add_area_light(name, location, energy, size, color, coll, target=None):
    light_data = bpy.data.lights.new(name, "AREA")
    light_data.energy = energy
    light_data.shape = "DISK"
    light_data.size = size
    light_data.color = rgba(color)[:3]
    light = bpy.data.objects.new(name, light_data)
    coll.objects.link(light)
    light.location = location
    if target is not None:
        look_at(light, target)
    return light


def look_at(obj, target):
    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def add_camera(scene, name, location, target, ortho_scale=None, lens=72.0, coll=None):
    camera_data = bpy.data.cameras.new(name)
    camera = bpy.data.objects.new(name, camera_data)
    (coll or scene.collection).objects.link(camera)
    camera.location = location
    look_at(camera, target)
    if ortho_scale is not None:
        camera_data.type = "ORTHO"
        camera_data.ortho_scale = ortho_scale
    else:
        camera_data.type = "PERSP"
        camera_data.lens = lens
    scene.camera = camera
    return camera


def add_stage(scene, coll, materials):
    floor = bpy.data.meshes.new("摄影棚_奶油地面_网格")
    floor.from_pydata(
        [(-9, -8, 0), (9, -8, 0), (9, 9, 0), (-9, 9, 0)],
        [],
        [(0, 1, 2, 3)],
    )
    floor.update()
    obj = bpy.data.objects.new("摄影棚_奶油地面", floor)
    coll.objects.link(obj)
    obj.data.materials.append(materials["floor"])

    backdrop = bpy.data.meshes.new("摄影棚_无缝背景_网格")
    backdrop.from_pydata(
        [(-9, 5.8, 0), (9, 5.8, 0), (9, 5.8, 8), (-9, 5.8, 8)],
        [],
        [(0, 1, 2, 3)],
    )
    backdrop.update()
    back = bpy.data.objects.new("摄影棚_无缝背景", backdrop)
    coll.objects.link(back)
    back.data.materials.append(materials["backdrop"])

    # Subtle circular contact mat keeps the figures grounded without recreating the room.
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=128,
        radius=3.0,
        depth=0.025,
        location=(0, 0.15, -0.012),
    )
    disc = bpy.context.object
    disc.name = "摄影棚_柔和圆形地台"
    move_to_collection(disc, coll)
    disc.data.materials.append(materials["floor_disc"])
    bevel = disc.modifiers.new("地台圆边", "BEVEL")
    bevel.width = 0.04
    bevel.segments = 5
    smooth_mesh(disc)


def convert_curves_for_export():
    for obj in list(bpy.context.scene.objects):
        if obj.type == "CURVE" and not obj.name.startswith("OUTLINE_"):
            bpy.context.view_layer.objects.active = obj
            obj.select_set(True)
            bpy.ops.object.convert(target="MESH")
            obj.select_set(False)


def render_view(scene, path, camera):
    scene.camera = camera
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


def main():
    scene = clean_scene()
    coll_yiyi = collection("01_一二_高精度角色")
    coll_bubu = collection("02_布布_高精度角色")
    coll_stage = collection("03_角色棚_极简")
    coll_lights = collection("04_摄影灯光")

    materials = {
        "yiyi_white": make_skin_material("MAT_一二_暖象牙白绒面", "#F8F4EC"),
        "bubu_brown": make_skin_material("MAT_布布_奶茶棕绒面", "#BE8067"),
        "dark": make_material("MAT_共同_深可可五官", "#2E1D1B", roughness=0.40, coat=0.16),
        "ink": make_material("MAT_共同_哑光五官线", "#241716", roughness=0.96),
        "derived_black": make_material("MAT_一二_脚趾刻线", "#17100F", roughness=0.58),
        "eye": make_material("MAT_共同_玻璃豆豆眼", "#241817", roughness=0.12, coat=0.72),
        "highlight": make_material("MAT_共同_眼神高光", "#FFFDF7", roughness=0.06, coat=0.70),
        "yiyi_blush": make_material("MAT_一二_樱花粉腮红", "#EFADB2", roughness=0.76),
        "bubu_blush": make_material("MAT_布布_杏金腮红", "#F2B84F", roughness=0.74),
        "bubu_ear": make_material("MAT_布布_深棕耳缘", "#5B392E", roughness=0.52, coat=0.08),
        "bubu_ear_inner": make_material("MAT_布布_肉桂色耳窝", "#563126", roughness=0.66),
        "bow": make_material("MAT_一二_深咖蝴蝶领结", "#3A2324", roughness=0.34, coat=0.20),
        "outline": make_material("MAT_共同_手绘轮廓", "#241716", roughness=0.92),
        "floor": make_material("MAT_摄影棚_奶油地面", "#F3EDE4", roughness=0.88),
        "backdrop": make_material("MAT_摄影棚_暖白背景", "#F7F1E9", roughness=0.90),
        "floor_disc": make_material("MAT_摄影棚_淡杏色地台", "#EDE1D5", roughness=0.82),
    }
    materials["outline"].use_backface_culling = True
    materials["outline"].diffuse_color = rgba("#241716")

    add_stage(scene, coll_stage, materials)
    yiyi_root = build_character("一二", "yiyi", -1.50, coll_yiyi, materials)
    bubu_root = build_character("布布", "bubu", 1.50, coll_bubu, materials)

    add_area_light(
        "LIGHT_柔和主光",
        (-4.4, -5.0, 7.1),
        900.0,
        5.0,
        "#FFF1E4",
        coll_lights,
        target=(0.0, 0.0, 1.55),
    )
    add_area_light(
        "LIGHT_清爽补光",
        (4.4, -3.2, 4.2),
        540.0,
        4.0,
        "#E4EEFF",
        coll_lights,
        target=(0.0, 0.0, 1.45),
    )
    add_area_light(
        "LIGHT_轮廓背光",
        (0.4, 4.4, 6.1),
        980.0,
        3.5,
        "#FFD7C2",
        coll_lights,
        target=(0.0, 0.0, 1.60),
    )
    add_area_light(
        "LIGHT_正面柔眼",
        (0.0, -6.0, 3.0),
        220.0,
        2.5,
        "#FFF7EC",
        coll_lights,
        target=(0.0, 0.0, 1.75),
    )

    main_camera = add_camera(
        scene,
        "CAM_双人正面_正交",
        (0.0, -10.0, 1.78),
        (0.0, 0.0, 1.47),
        ortho_scale=6.10,
        coll=coll_lights,
    )
    side_camera = add_camera(
        scene,
        "CAM_侧面验证_正交",
        (0.0, -10.0, 1.78),
        (0.0, 0.0, 1.47),
        ortho_scale=6.10,
        coll=coll_lights,
    )
    back_camera = add_camera(
        scene,
        "CAM_背面验证_正交",
        (0.0, -10.0, 1.78),
        (0.0, 0.0, 1.47),
        ortho_scale=6.10,
        coll=coll_lights,
    )
    detail_camera = add_camera(
        scene,
        "CAM_三分之四特写",
        (4.8, -10.5, 3.65),
        (0.0, 0.0, 1.63),
        ortho_scale=6.55,
        coll=coll_lights,
    )

    scene.camera = main_camera
    scene["项目说明"] = (
        "依据两张多视角设定图重建；一二为白色熊猫，布布为奶茶棕小熊；"
        "不包含温馨小窝场景。"
    )
    scene["建模特征"] = "圆角方头、短手短脚、豆豆眼、倒八字眉、波浪嘴、背面小尾巴"
    scene["源参考_一二"] = "一二布布_原设定图_2.jpg"
    scene["源参考_布布"] = "一二布布_原设定图_1.jpg"

    # Save the editable, curve-based scene first.
    scene.render.filepath = MAIN_RENDER
    bpy.ops.wm.save_as_mainfile(filepath=BLEND_PATH)
    render_view(scene, MAIN_RENDER, main_camera)

    yiyi_root.rotation_euler.z = math.radians(90)
    bubu_root.rotation_euler.z = math.radians(90)
    render_view(scene, SIDE_RENDER, side_camera)

    yiyi_root.rotation_euler.z = math.radians(180)
    bubu_root.rotation_euler.z = math.radians(180)
    render_view(scene, BACK_RENDER, back_camera)

    yiyi_root.rotation_euler.z = math.radians(-14)
    bubu_root.rotation_euler.z = math.radians(14)
    render_view(scene, THREE_QUARTER_RENDER, detail_camera)

    yiyi_root.rotation_euler.z = 0.0
    bubu_root.rotation_euler.z = 0.0
    scene.camera = main_camera
    scene.render.filepath = MAIN_RENDER
    bpy.ops.wm.save_as_mainfile(filepath=BLEND_PATH)

    # Create a game-oriented GLB while excluding the studio and manual outlines.
    for obj in scene.objects:
        obj.select_set(False)
    for coll in (coll_yiyi, coll_bubu):
        for obj in coll.objects:
            if (obj.type in {"MESH", "CURVE", "ARMATURE", "EMPTY"}
                    and not obj.name.startswith("OUTLINE_")):
                obj.select_set(True)
    bpy.context.view_layer.objects.active = yiyi_root
    bpy.ops.export_scene.gltf(
        filepath=GLB_PATH,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_draco_mesh_compression_enable=True,
        export_draco_mesh_compression_level=10,
        export_draco_position_quantization=14,
        export_draco_normal_quantization=10,
        export_draco_texcoord_quantization=12,
    )

    print("BUILD_COMPLETE")
    print("BLEND", BLEND_PATH)
    print("GLB", GLB_PATH)
    print("RENDERS", MAIN_RENDER, SIDE_RENDER, BACK_RENDER, THREE_QUARTER_RENDER)
    print("OBJECT_COUNTS", len(coll_yiyi.objects), len(coll_bubu.objects))


if __name__ == "__main__":
    main()
