import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.165.0/build/three.module.js';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/loaders/GLTFLoader.js';
import { Sky } from 'https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/objects/Sky.js';
import { createTerrain, getTerrainHeightAt, getGrassBunches, removeGrassBunch } from './terrain.js';
import { createRicegrassUI, updateRicegrassCount } from './gui.js';

let scene, camera, renderer, player, idleAction, walkAction, mixer, clock;
let moveForward = false;
let moveBackward = false;
let moveLeft = false;
let moveRight = false;
const rotationSpeed = 0.02;
const movementSpeed = 0.08;
let direction = new THREE.Vector3();
const terrainHalfSize = 100; // Half of the terrain size
let canMove = true;
let sun = new THREE.Vector3();
let highlightedBunch = null;
let ricegrass = 0;

let targetCameraPosition = new THREE.Vector3();
let smoothFactor = 0.05;
const spawnPosition = new THREE.Vector3(0, -20, 40);

document.addEventListener('DOMContentLoaded', () => {
    let audioStarted = false;

    function startAudio() {
        if (!audioStarted) {
            const natureSounds = document.getElementById('natureSounds');
            const backgroundMusic = document.getElementById('backgroundMusic');

            // Start both audio elements muted
            natureSounds.muted = true;
            backgroundMusic.muted = true;

            // Set initial volume
            natureSounds.volume = 0.5; // Set to 50%
            backgroundMusic.volume = 0.3; // Set to 30%

            natureSounds.play().catch(error => {
                console.log('Nature sounds playback error:', error);
            });

            backgroundMusic.play().catch(error => {
                console.log('Background music playback error:', error);
            });

            audioStarted = true;
        }
    }

    window.addEventListener('mousemove', startAudio, { once: true });

    document.getElementById('playButton').addEventListener('click', startGame);
    document.getElementById('musicButton').addEventListener('click', toggleMusicMute);
    document.getElementById('soundButton').addEventListener('click', toggleSoundMute);

    const inGameMusicButton = document.getElementById('in-game-musicButton');
    const inGameSoundButton = document.getElementById('in-game-soundButton');
    const inGameHelpButton = document.getElementById('in-game-helpButton');

    inGameMusicButton.addEventListener('click', toggleMusicMute);
    inGameSoundButton.addEventListener('click', toggleSoundMute);

    const buttons = document.querySelectorAll('button');
    buttons.forEach(button => {
        button.addEventListener('mouseenter', playHoverSound);
        button.addEventListener('click', playHoverSound);
    });
});

function playHoverSound() {
    const hoverSound = document.getElementById('hoverSound');
    hoverSound.currentTime = 0;
    hoverSound.play();
}

function toggleMusicMute() {
    const backgroundMusic = document.getElementById('backgroundMusic');
    const musicButton = document.getElementById('musicButton');
    backgroundMusic.muted = !backgroundMusic.muted;
    if (backgroundMusic.muted) {
        musicButton.querySelector('img').src = 'public/musicbuttonoff.svg';
    } else {
        musicButton.querySelector('img').src = 'public/musicbutton.svg';
    }
}

function toggleSoundMute() {
    const natureSounds = document.getElementById('natureSounds');
    const soundButton = document.getElementById('soundButton');
    natureSounds.muted = !natureSounds.muted;
    if (natureSounds.muted) {
        soundButton.querySelector('img').src = 'public/soundbuttonoff.svg';
    } else {
        soundButton.querySelector('img').src = 'public/soundbutton.svg';
    }
}

function init() {
    console.log('Initializing scene');

    // Scene
    scene = new THREE.Scene();
    console.log('Scene initialized:', scene);

    // Camera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.5, 1000);
    camera.position.set(20, 40, 90);
    scene.add(camera);

    // Renderer
    renderer = new THREE.WebGLRenderer();
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0xffffff); // Set background color to white
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.5;
    document.body.appendChild(renderer.domElement);

    // Initialize and create terrain
    console.log('Creating terrain');
    createTerrain(scene);

    // Initialize clock
    clock = new THREE.Clock();

    // Initialize sky and update the sun position
    initSky();

    // Load player model
    const loader = new GLTFLoader();
    loader.load('public/animate-idle.glb', function(gltf) {
        player = gltf.scene;
        player.position.copy(spawnPosition);
        scene.add(player);

        if (gltf.animations && gltf.animations.length) {
            mixer = new THREE.AnimationMixer(player);
            gltf.animations.forEach((clip) => {
                mixer.clipAction(clip).play();
            });
        }

        console.log('Idle animation loaded and playing:', idleAction);

        loader.load('public/animate-walk.glb', function(gltf) { // Ensure you're using the correct walk animation file
            walkAction = mixer.clipAction(gltf.animations[0]);
            walkAction.enabled = false;
            console.log('Walk animation loaded:', walkAction);
        });

        // Align player to face the sun
        alignPlayerToSun();
    });

    // Add lighting
    const ambientLight = new THREE.AmbientLight(0x404040); // Soft white light
    scene.add(ambientLight);

    // Add Hemisphere Light opposite to the sun with warm diffused colors
    const hemisphereLight = new THREE.HemisphereLight(0xffe5b4, 0xffad60, 1);
    hemisphereLight.position.set(-sun.x, -sun.y + 100, 100); // Position opposite to the sun
    scene.add(hemisphereLight);

    // Keyboard controls
    document.addEventListener('keydown', onKeyDown, false);
    document.addEventListener('keyup', onKeyUp, false);

    // Handle window resize
    window.addEventListener('resize', onWindowResize, false);

    // Initialize ricegrass UI
    createRicegrassUI();
}

function initSky() {
    // Add Sky
    const sky = new Sky();
    sky.scale.setScalar(1000000);
    scene.add(sky);

    const effectController = {
        turbidity: 10,
        rayleigh: 4,
        mieCoefficient: 0.005,
        mieDirectionalG: 0.7,
        elevation: 2,
        azimuth: 180,
        exposure: renderer.toneMappingExposure
    };

    function updateSky() {
        const uniforms = sky.material.uniforms;
        uniforms['turbidity'].value = effectController.turbidity;
        uniforms['rayleigh'].value = effectController.rayleigh;
        uniforms['mieCoefficient'].value = effectController.mieCoefficient;
        uniforms['mieDirectionalG'].value = effectController.mieDirectionalG;

        const phi = THREE.MathUtils.degToRad(90 - effectController.elevation);
        const theta = THREE.MathUtils.degToRad(effectController.azimuth);

        sun.setFromSphericalCoords(1, phi, theta);

        uniforms['sunPosition'].value.copy(sun);

        renderer.toneMappingExposure = effectController.exposure;
        renderer.render(scene, camera);
    }

    updateSky();
}

function alignPlayerToSun() {
    if (player) {
        const directionToSun = new THREE.Vector3();
        directionToSun.subVectors(sun, player.position).normalize();

        // Calculate the angle to rotate the player to face the sun
        const angle = Math.atan2(directionToSun.x, directionToSun.z);
        player.rotation.y = angle;
    }
}

function onKeyDown(event) {
    if (!canMove) return; // Disable movement when the player cannot move

    switch (event.code) {
        case 'ArrowUp':
        case 'KeyW':
            moveForward = true;
            break;
        case 'ArrowRight':
        case 'KeyD':
            moveRight = true;
            break;
        case 'ArrowDown':
        case 'KeyS':
            moveBackward = true;
            break;
        case 'ArrowLeft':
        case 'KeyA':
            moveLeft = true;
            break;
        case 'Space':
            if (highlightedBunch) {
                ricegrass++;
                console.log('Rice grass collected:', ricegrass);
                removeGrassBunch(highlightedBunch);
                highlightedBunch = null;

                // Hide message box
                const messageBox = document.getElementById('messageBox');
                messageBox.style.display = 'none';

                // Update ricegrass count UI
                updateRicegrassCount(ricegrass);
            }
            break;
    }
    switchAnimation();
}

function onKeyUp(event) {
    if (!canMove) return; // Disable movement when the player cannot move

    switch (event.code) {
        case 'ArrowUp':
        case 'KeyW':
            moveForward = false;
            break;
        case 'ArrowRight':
        case 'KeyD':
            moveRight = false;
            break;
        case 'ArrowDown':
        case 'KeyS':
            moveBackward = false;
            break;
        case 'ArrowLeft':
        case 'KeyA':
            moveLeft = false;
            break;
    }
    switchAnimation();
}

function switchAnimation() {
    if (mixer) {
        console.log('Switching animation.');
        if (moveForward || moveBackward || moveLeft || moveRight) {
            if (idleAction && idleAction.isRunning()) {
                console.log('Fading out idle animation.');
                idleAction.fadeOut(0.5);
                idleAction.stop();
            }
            if (walkAction && !walkAction.isRunning()) {
                console.log('Starting walk animation.');
                walkAction.enabled = true;
                walkAction.reset();
                walkAction.fadeIn(0.5);
                walkAction.play();
            }
        } else {
            if (walkAction && walkAction.isRunning()) {
                console.log('Fading out walk animation.');
                walkAction.fadeOut(0.5);
                walkAction.stop();
            }
            if (idleAction && !idleAction.isRunning()) {
                console.log('Starting idle animation.');
                idleAction.reset();
                idleAction.fadeIn(0.5);
                idleAction.play();
            }
        }
    }
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function startGame() {
    // Hide the start screen
    const startScreen = document.getElementById('startScreen');
    startScreen.style.display = 'none';

    // Show the game GUI
    document.getElementById('ricegrass-container').style.display = 'block';

    // Initialize the game
    init();

    // Start the game
    animate();
}

function animate() {
    requestAnimationFrame(animate);

    const delta = clock.getDelta();

    if (mixer) {
        mixer.update(delta);
    }

    if (canMove && player) { // Ensure player is defined
        // Calculate the forward and right vectors based on the player's rotation
        const forward = new THREE.Vector3(Math.sin(player.rotation.y), 0, Math.cos(player.rotation.y));
        const right = new THREE.Vector3(Math.cos(player.rotation.y), 0, -Math.sin(player.rotation.y));

        // Calculate the movement direction
        direction.set(0, 0, 0);
        if (moveForward) direction.add(forward);
        if (moveBackward) direction.sub(forward);
        if (moveLeft) player.rotation.y += rotationSpeed;
        if (moveRight) player.rotation.y -= rotationSpeed;

        // Normalize direction vector and apply movement speed
        direction.normalize().multiplyScalar(movementSpeed);

        // Calculate the new position
        const newX = player.position.x + direction.x;
        const newZ = player.position.z + direction.z;

        // Check boundaries and update position
        if (newX >= -terrainHalfSize && newX <= terrainHalfSize) {
            player.position.x = newX;
        }

        if (newZ >= -terrainHalfSize && newZ <= terrainHalfSize) {
            player.position.z = newZ;
        }

        // Update player position based on terrain height
        const terrainHeight = getTerrainHeightAt(player.position.x, player.position.z);
        player.position.y = terrainHeight + 0.2; // Adjust to be slightly above the terrain

        // Update target camera position relative to player only when moving forward or backward
        if (moveForward || moveBackward) {
            const offset = new THREE.Vector3(0, 3, -12).applyAxisAngle(new THREE.Vector3(0, 1, 0), player.rotation.y);
            targetCameraPosition.copy(player.position).add(offset);
        }

        // Smoothly interpolate the camera position to the target position
        camera.position.lerp(targetCameraPosition, smoothFactor);

        // Ensure the camera is always looking at the player
        camera.lookAt(player.position.x, player.position.y + 6, player.position.z);

        // Check for collisions with grass
        checkGrassCollision();
    }

    // Update grass blades with time uniform
    scene.traverse((object) => {
        if (object.isMesh && object.material && object.material.uniforms && object.material.uniforms.time) {
            object.material.uniforms.time.value += delta;
        }
    });

    renderer.render(scene, camera);
}

function checkGrassCollision() {
    const grassBunches = getGrassBunches();
    let isColliding = false;

    grassBunches.forEach(bunch => {
        const distance = player.position.distanceTo(bunch.position);

        if (distance < 2) { // Collision threshold
            if (highlightedBunch !== bunch) {
                if (highlightedBunch) {
                    // Remove previous outline
                    highlightedBunch.traverse(child => {
                        if (child.isMesh) {
                            child.material.emissive.set(0x000000);
                        }
                    });
                }

                // Highlight new bunch
                bunch.traverse(child => {
                    if (child.isMesh) {
                        child.material.emissive.set(0x00ff00);
                    }
                });

                highlightedBunch = bunch;
            }

            // Display message box
            const messageBox = document.getElementById('messageBox');
            messageBox.style.display = 'block';
            document.getElementById('harvestText').textContent = 'Harvest?';
            document.getElementById('instructionText').textContent = "(press 'spacebar' to harvest rice grass)";

            isColliding = true;
        }
    });

    if (!isColliding && highlightedBunch) {
        // Remove outline when no collision
        highlightedBunch.traverse(child => {
            if (child.isMesh) {
                child.material.emissive.set(0x000000);
            }
        });
        highlightedBunch = null;

        // Hide message box
        const messageBox = document.getElementById('messageBox');
        messageBox.style.display = 'none';
    }
}
