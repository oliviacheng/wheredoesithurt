import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.165.0/build/three.module.js';
import { Sky } from 'https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/objects/Sky.js';
import { createTerrain, getTerrainHeightAt } from './terrain.js';

let scene, camera, renderer, sphere;
let moveForward = false;
let moveBackward = false;
let moveLeft = false;
let moveRight = false;
const rotationSpeed = 0.02;
const movementSpeed = 0.08;
let velocity = new THREE.Vector3();
let direction = new THREE.Vector3();
const objects = [];
let isColliding = false;
let collidingObject = null;
const terrainHalfSize = 100; // Half of the terrain size

init();
animate();

function init() {
    console.log('Initializing scene');

    // Set up document click event to start game
    document.addEventListener('click', startGame);

    // Scene
    scene = new THREE.Scene();
    console.log('Scene initialized:', scene);

    // Camera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 2, 5);
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

    // Sphere (Player)
    const sphereGeometry = new THREE.SphereGeometry(0.5, 16, 16);
    const sphereMaterial = new THREE.MeshLambertMaterial({ color: 0x7777ff });
    sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
    sphere.position.set(0, 1, 0);
    scene.add(sphere);

    // Add lighting
    const ambientLight = new THREE.AmbientLight(0x404040); // Soft white light
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(100, 100, 100);
    scene.add(directionalLight);

    // Create spinning cube
    const boxGeometry = new THREE.BoxGeometry();
    const boxMaterial = new THREE.MeshLambertMaterial({ color: Math.random() * 0xffffff });
    const box = new THREE.Mesh(boxGeometry, boxMaterial);
    box.position.x = -5;
    box.position.y = 1.5;
    box.position.z = -1;
    scene.add(box);
    objects.push(box);

    // Keyboard controls
    document.addEventListener('keydown', onKeyDown, false);
    document.addEventListener('keyup', onKeyUp, false);

    // Handle window resize
    window.addEventListener('resize', onWindowResize, false);

    // Event listener for Enter key in the input box
    document.getElementById('textInput').addEventListener('keydown', function(event) {
        if (event.key === 'Enter') {
            submitText();
        }
    });

    // Initialize sky
    initSky();
}

function initSky() {
    // Add Sky
    const sky = new Sky();
    sky.scale.setScalar(1000000);
    scene.add(sky);

    const sun = new THREE.Vector3();

    const effectController = {
        turbidity: 10,
        rayleigh: 3,
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

        // Align sphere to face the sun
        const directionToSun = new THREE.Vector3();
        directionToSun.subVectors(sun, sphere.position).normalize();
        
        // Calculate the angle to rotate the sphere to face the sun
        const angle = Math.atan2(directionToSun.x, directionToSun.z);
        sphere.rotation.y = angle;

        // Update camera position relative to sphere (for third-person view)
        const offset = new THREE.Vector3(0, 1, -5).applyQuaternion(sphere.quaternion);
        camera.position.copy(sphere.position).add(offset);
        camera.lookAt(sphere.position.x, sphere.position.y + 1.6, sphere.position.z);
    }

    updateSky();
}

function onKeyDown(event) {
    if (inputBoxVisible()) return; // Disable movement when the input box is displayed

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
    }
}

function onKeyUp(event) {
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
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function showInputBox() {
    const inputBox = document.getElementById('textInputBox');
    inputBox.style.display = 'block';
    inputBox.querySelector('input').focus(); // Focus on the input box immediately
}

function hideInputBox() {
    const inputBox = document.getElementById('textInputBox');
    inputBox.style.display = 'none';
}

function displaySubmittedText(text) {
    const textDisplay = document.createElement('div');
    textDisplay.innerText = text;
    textDisplay.className = 'submittedText';
    document.body.appendChild(textDisplay);

    setTimeout(() => {
        textDisplay.remove();
        if (collidingObject) {
            scene.remove(collidingObject);
            objects.splice(objects.indexOf(collidingObject), 1); // Remove from objects array
            collidingObject = null;
            isColliding = false; // Allow movement again
        }
    }, 10000); // Display for 10 seconds
}

function submitText() {
    const inputText = document.getElementById('textInput').value;
    hideInputBox(); // Hide the input box immediately
    console.log("Submitted text: " + inputText);
    displaySubmittedText(inputText);
}

function inputBoxVisible() {
    return document.getElementById('textInputBox').style.display === 'block';
}

function checkCollision() {
    const sphereBox = new THREE.Box3().setFromObject(sphere);
    for (let i = 0; i < objects.length; i++) {
        const objectBox = new THREE.Box3().setFromObject(objects[i]);
        if (sphereBox.intersectsBox(objectBox)) {
            if (!isColliding && !inputBoxVisible()) {
                isColliding = true;
                collidingObject = objects[i];
                showInputBox();
            }
            return;
        }
    }
}

function startGame() {
    // Hide the start screen
    const startScreen = document.getElementById('startScreen');
    startScreen.style.display = 'none';

    // Remove the event listener to prevent it from firing multiple times
    document.removeEventListener('click', startGame);

    animate();
}

function animate() {
    requestAnimationFrame(animate);

    // Calculate the forward and right vectors based on the sphere's rotation
    const forward = new THREE.Vector3(Math.sin(sphere.rotation.y), 0, Math.cos(sphere.rotation.y));
    const right = new THREE.Vector3(Math.cos(sphere.rotation.y), 0, -Math.sin(sphere.rotation.y));

    // Calculate the movement direction
    direction.set(0, 0, 0);
    if (moveForward) direction.add(forward);
    if (moveBackward) direction.sub(forward);
    if (moveLeft) direction.sub(right);
    if (moveRight) direction.add(right);

    // Normalize direction vector and apply movement speed
    direction.normalize().multiplyScalar(movementSpeed);

    // Calculate the new position
    const newX = sphere.position.x + direction.x;
    const newZ = sphere.position.z + direction.z;

    // Check boundaries and update position
    if (newX >= -terrainHalfSize && newX <= terrainHalfSize) {
        sphere.position.x = newX;
    }

    if (newZ >= -terrainHalfSize && newZ <= terrainHalfSize) {
        sphere.position.z = newZ;
    }

    // Rotate the sphere for turning
    if (moveLeft) {
        sphere.rotation.y += rotationSpeed;
    }
    if (moveRight) {
        sphere.rotation.y -= rotationSpeed;
    }

    // Update sphere position based on terrain height
    const terrainHeight = getTerrainHeightAt(sphere.position.x, sphere.position.z);
    sphere.position.y = terrainHeight + 1; // Adjust to be slightly above the terrain

    // Update camera position relative to sphere (for first-person view)
    const offset = new THREE.Vector3(0, 1, -5).applyAxisAngle(new THREE.Vector3(0, 1, 0), sphere.rotation.y);
    camera.position.copy(sphere.position).add(offset);
    camera.lookAt(sphere.position.x, sphere.position.y + 1.6, sphere.position.z);

    // Check for collisions
    checkCollision();

    // Rotate the cubes
    objects.forEach(obj => {
        obj.rotation.x += 0.01;
        obj.rotation.y += 0.01;
    });

    renderer.render(scene, camera);
}
