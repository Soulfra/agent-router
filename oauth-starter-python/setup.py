"""OAuth Starter - Multi-provider OAuth with auto-subdomain creation"""

from setuptools import setup, find_packages

with open("README.md", "r", encoding="utf-8") as fh:
    long_description = fh.read()

setup(
    name="oauth-starter",
    version="0.1.0",
    author="ColdStartKit",
    author_email="hello@coldstartkit.com",
    description="Multi-provider OAuth with auto-subdomain creation",
    long_description=long_description,
    long_description_content_type="text/markdown",
    url="https://github.com/coldstartkit/oauth-starter-python",
    packages=find_packages(),
    classifiers=[
        "Development Status :: 3 - Alpha",
        "Intended Audience :: Developers",
        "Topic :: Software Development :: Libraries :: Python Modules",
        "License :: OSI Approved :: MIT License",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.9",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
        "Programming Language :: Python :: 3.12",
    ],
    python_requires=">=3.9",
    install_requires=[
        "fastapi>=0.109.0",
        "uvicorn[standard]>=0.27.0",
        "python-multipart>=0.0.6",
        "httpx>=0.26.0",
        "sqlalchemy>=2.0.25",
        "psycopg2-binary>=2.9.9",
        "python-dotenv>=1.0.0",
        "cryptography>=41.0.7",
        "pydantic>=2.5.3",
        "pydantic-settings>=2.1.0",
    ],
    extras_require={
        "supabase": ["supabase>=2.3.0"],
        "dev": ["pytest>=7.4.0", "pytest-asyncio>=0.21.0", "black>=23.0.0", "ruff>=0.1.0"],
    },
    entry_points={
        "console_scripts": [
            "oauth-starter=oauth_starter.app:main",
        ],
    },
)
